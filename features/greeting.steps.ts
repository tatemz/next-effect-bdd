import { Bdd } from "effect-bdd";
import { Effect, Layer, Schema } from "effect";
import { chromium, type Page } from "playwright";
// The steps touch `document` only through `page.waitForFunction`, which
// serializes the function to the browser; tsconfig's "dom" lib types it.
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
  HttpRouter,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Greeter, Language } from "../domain/greeter.ts";
import { Incrementer } from "../domain/incrementer.ts";
import { Api } from "../server/api.ts";
import { appFor } from "../server/app.ts";
import { Mode } from "../server/nextApp.ts";
import { startApp } from "../server/pipeline.ts";

/**
 * Captures a mode name from a step, validated by the app's own `Mode` union.
 *
 * A step like `a POC app in production mode ...` binds `mode` to
 * `"production"`; any other string fails the step at parse time, and because
 * this is the same `Mode` the entry points read from the environment, the
 * scenarios can never drift onto a mode the app does not serve.
 *
 * @example
 * // Matches: "a POC app in development mode with the en greeter"
 * // -> { mode: "development" }
 * // Bdd.given`a POC app in ${mode} mode with the ${language} greeter`(step);
 */
const mode = Bdd.capture("mode", Mode);
/**
 * Captures a language name from a step, validated by the `Language` schema.
 *
 * A step like `a POC app in production mode with the es greeter` binds
 * `language` to `"es"`; any other language fails the step at parse time, not
 * deeper in the run.
 *
 * @example
 * // Matches: "... with the en greeter" -> { language: "en" }
 * // Bdd.given`a POC app in ${mode} mode with the ${language} greeter`(step);
 */
const language = Bdd.capture("language", Language);
/**
 * Captures an expected health status string from a step.
 *
 * @example
 * // Matches: "the health check says status ok and greeting Hello!"
 * // -> { status: "ok", greeting: "Hello!" }
 * // Bdd.then`the health check says status ${status} and greeting ${greeting}`(step);
 */
const status = Bdd.capture("status", Schema.String);
/**
 * Captures an expected greeting string from a step.
 *
 * @example
 * // Matches: "the health check says status ok and greeting ¡Hola!"
 * // -> { greeting: "¡Hola!" }
 * // Bdd.then`the health check says status ${status} and greeting ${greeting}`(step);
 */
const greeting = Bdd.capture("greeting", Schema.String);
/**
 * Captures an arbitrary expected string from a step.
 *
 * @example
 * // Matches: "the home page says Hello!" -> { expected: "Hello!" }
 * // Bdd.then`the home page says ${expected}`(step);
 */
const expected = Bdd.capture("expected", Schema.String);
/**
 * Captures a greeting count from a step, parsed from its digits.
 *
 * `FiniteFromString` turns the captured text into a number, so the step can
 * compare it numerically against the reveal's reported count.
 *
 * @example
 * // Matches: "the reveal reports greeting 2" -> { greetingNumber: 2 }
 * // Bdd.then`the reveal reports greeting ${greetingNumber}`(step);
 */
const greetingNumber = Bdd.capture("greetingNumber", Schema.FiniteFromString);

/**
 * Runs a Playwright promise-returning call as an Effect, naming the call in
 * the failure so a browser timeout says which interaction timed out.
 *
 * @example
 * // A failed navigation fails with "open the home page: <reason>",
 * // not an anonymous rejected promise:
 * // yield* attempt("open the home page", () => page.goto(url));
 */
const attempt = <A>(label: string, f: () => Promise<A>) =>
  Effect.tryPromise({
    try: f,
    catch: (cause) =>
      `${label}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

/**
 * The greeter a scenario composes: the chosen `Greeter` merged with the
 * `greeting-count` `Incrementer` page renders read.
 *
 * @example
 * const greeter = greeterFor("en"); // Greeter + Incrementer, ready to provide
 */
const greeterFor = (language: Language) =>
  Layer.provideMerge(
    Greeter.layerFor(language),
    Incrementer.greetingCountLayer,
  );

/**
 * The scenario state the shared setup steps produce (and the shared `When`
 * consumes): the composed app for the chosen mode, plus the greeter to
 * provide it once the language step has run.
 *
 * Shared steps live outside the scenario pipes, so they carry no contextual
 * state type; these are those types, written once here instead of repeated
 * per scenario. `AppMode` is the state after the mode `Given`; `AppSetup`
 * adds the greeter the language `And` contributes.
 *
 * @example
 * // After "a POC app in production mode": AppMode.
 * // After "the app is using the en greeter": AppSetup.
 */
type AppMode = {
  readonly mode: Mode;
  readonly app: ReturnType<typeof appFor>;
};
type AppSetup = AppMode & {
  readonly greeter: ReturnType<typeof greeterFor>;
};

/**
 * The shared first `Given`: the real app composed for the captured mode.
 *
 * A setup step states one concern: which runtime the app runs in. `appFor`
 * is the same total mapping the entry points use: `production` serves the
 * built `.next` output (fast, but requires `pnpm build` beforehand), while
 * `development` boots Next with on-demand compilation and HMR (slow, but no
 * build needed).
 *
 * @example
 * // "a POC app in production mode" -> { mode: "production", app: ... }
 */
const givenAppInMode = Bdd.given`a POC app in ${mode} mode`(
  Effect.fn("Greeting.appInMode")(function* ({ mode }: { readonly mode: Mode }) {
    return { mode, app: appFor(mode) };
  }),
);

/**
 * The shared second setup `And`: the greeter the app serves.
 *
 * The other setup concern, kept separate from the mode: each scenario gets
 * its own fresh `Greeter` merged with the `greeting-count` `Incrementer`
 * that page renders read.
 *
 * @example
 * // "the app is using the es greeter" -> state gains { greeter }
 */
const givenGreeterForLanguage = Bdd.given`the app is using the ${language} greeter`(
  Effect.fn("Greeting.appWithGreeter")(
    function* ({ language }: { readonly language: Language }, state: AppMode) {
      return { ...state, greeter: greeterFor(language) };
    },
  ),
);

/**
 * The shared `When`: start the scenario's app on an ephemeral port.
 *
 * `startApp(0)` binds a free port per scenario, so dev and prod examples
 * run concurrently without fighting over a port; the server lives until the
 * scenario's scope closes.
 *
 * @example
 * // After the Given, the state gains { url, api } for the later steps.
 */
const whenAppIsRunning = Bdd.when`the app is running`(
  Effect.fn("Greeting.appIsRunning")(function* (state: AppSetup) {
    const port = yield* state.app.pipe(
      HttpRouter.provideRequest(state.greeter),
      startApp(0),
    );

    const url = `http://localhost:${port}`;
    const api = yield* HttpApiClient.make(Api, { baseUrl: url });

    return {
      ...state,
      url,
      api,
    };
  }),
);

/**
 * Keeps a Playwright page hydrating against a dev-mode Next server.
 *
 * Turbopack compiles client chunks on demand: a fresh server can answer the
 * page's own request before the chunks the rendered HTML references exist,
 * so the browser gets `404`s for them and — never retrying a failed script
 * fetch — never hydrates. This route intercepts `/_next/static/*` fetches
 * and re-dials upstream until the compile lands, so hydration waits for the
 * compile instead of dying on it. It is a no-op passthrough in production,
 * where the chunks are already built.
 *
 * @example
 * // In the browser step, before the first goto:
 * yield* attempt("route the page's static chunks", () =>
 *   retryStaticChunks(page),
 * );
 */
const retryStaticChunks = (page: Page) =>
  page.route("**/_next/static/**", async (route) => {
    // Turbopack dev compiles a page's chunks in well under a second once
    // the page request started the compile; two seconds is generous, and a
    // genuinely missing chunk still fails as a real 404 afterwards.
    for (let attemptNo = 0; attemptNo < 20; attemptNo += 1) {
      const response = await route.fetch({ timeout: 2000 }).catch(() => null);
      if (response !== null && response.status() < 400) {
        return route.fulfill({ response });
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Give up retrying and pass one real request through, so the browser
    // reports the true failure (a chunk that never exists, a dead server).
    return route.continue();
  });

/**
 * The app's Gherkin feature: the scenarios that pin the POC's observable
 * behavior end to end, once per mode.
 *
 * Each scenario builds the real app for its example's mode (`appFor(mode)`
 * with the chosen `Greeter`), starts it on an ephemeral port via
 * `startApp(0)`, and asserts over HTTP, the typed `Api` client, or a real
 * Chromium page. Scenarios are independent: every one gets its own app,
 * counter, and (where used) browser.
 *
 * @example
 * // Run the whole feature from the terminal (`pretest-bdd` builds first):
 * //   pnpm test-bdd
 * // Steps live in this file; the prose lives in features/greeting.feature.
 */
export const greetingVisitors = Bdd.feature("Greeting visitors").pipe(
  Bdd.scenario("The home page greets in the chosen language").pipe(
    givenAppInMode,
    givenGreeterForLanguage,
    whenAppIsRunning,
    Bdd.then`the home page says ${expected}`(
      Effect.fn("Greeting.homePageSays")(function* ({ expected }, state) {
        const body = yield* HttpClient.get(`${state.url}/`).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap((response) => response.text),
        );

        if (!body.includes(`<main id="message">${expected}</main>`)) {
          return yield* Effect.fail(
            `home page at ${state.url} did not say ${expected}`,
          );
        }

        return state;
      }),
    ),
    Bdd.provide(FetchHttpClient.layer),
  ),
  Bdd.scenario("The health check reports the configured greeter").pipe(
    givenAppInMode,
    givenGreeterForLanguage,
    whenAppIsRunning,
    Bdd.then`the health check says status ${status} and greeting ${greeting}`(
      Effect.fn("Greeting.healthCheckSays")(function* ({ greeting, status }, state) {
        // Fully typed: `health()` takes no arguments and resolves to the
        // server's `HealthResponse`, so a wrong field or status tag would be
        // a compile error, and a wrong wire shape a Schema error.
        const health = yield* state.api.health();

        if (health.status !== status) {
          return yield* Effect.fail(
            `health status was ${health.status}, expected ${status}`,
          );
        }

        if (health.greeting !== greeting) {
          return yield* Effect.fail(
            `health greeting was ${health.greeting}, expected ${greeting}`,
          );
        }

        return state;
      }),
    ),
    Bdd.provide(FetchHttpClient.layer),
  ),
  Bdd.scenario("The docs endpoint describes the API").pipe(
    givenAppInMode,
    givenGreeterForLanguage,
    whenAppIsRunning,
    Bdd.then`the swagger docs and openapi document are served`(
      Effect.fn("Greeting.docsAreServed")(function* (state) {
        const docs = yield* HttpClient.get(`${state.url}/docs`).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap((response) => response.text),
        );

        if (!docs.includes("swagger-ui")) {
          return yield* Effect.fail(
            `${state.url}/docs is not the Swagger UI`,
          );
        }

        const openapiResponse = yield* HttpClient.get(
          `${state.url}/openapi.json`,
        ).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap((response) => response.json),
        );
        const openapi = openapiResponse as {
          paths?: Record<string, unknown>;
        };

        if (openapi.paths?.["/health"] === undefined) {
          return yield* Effect.fail(
            "the openapi document does not describe /health",
          );
        }

        return state;
      }),
    ),
    Bdd.provide(FetchHttpClient.layer),
  ),
  Bdd.scenario("The reveal counts the page view and the health check").pipe(
    givenAppInMode,
    givenGreeterForLanguage,
    whenAppIsRunning,
    Bdd.when`a browser opens the home page`(
      Effect.fn("Greeting.browserOpensHomePage")(function* (state) {
        // The Scenario Resources pattern from the effect-bdd docs: acquire
        // Chromium inside the step, so scenario-scope finalizers run LIFO -
        // browser first, then the Next server. Acquiring it earlier (via
        // `Bdd.provide`) would tear the server down while the page's HMR
        // socket is still open, and a dev-mode Next refuses to close.
        const { browser, page } = yield* Effect.acquireRelease(
          Effect.gen(function* () {
            const browser = yield* attempt("launch chromium", () =>
              chromium.launch(),
            );
            const page = yield* attempt("open a page", () => browser.newPage());
            return { browser, page };
          }),
          ({ browser }) =>
            Effect.tryPromise(() => browser.close()).pipe(Effect.ignore),
        );
        // Before the first navigation: dev-mode chunk fetches must wait for
        // Turbopack's on-demand compile (see `retryStaticChunks`).
        yield* attempt("route the page's static chunks", () =>
          retryStaticChunks(page),
        );
        yield* attempt("open the home page", () => page.goto(`${state.url}/`));
        // The page render's own greeting is one of the two this reveal will
        // count, and the reveal only works through React: before hydration
        // the SSR'd form would take the native form POST, not the server
        // action. React attaches `__reactFiber$…` expando props when it
        // hydrates a DOM node, so that presence is the hydration signal.
        yield* attempt("wait for the reveal form to hydrate", () =>
          page.waitForFunction(() => {
            const form = document.querySelector("form");
            return (
              form !== null &&
              Object.getOwnPropertyNames(form).some((key) =>
                key.startsWith("__reactFiber$"),
              )
            );
          }),
        );
        return { ...state, page };
      }),
    ),
    Bdd.when`the health endpoint is hit`(
      Effect.fn("Greeting.healthEndpointHit")(function* (state) {
        // The typed client greets through the same per-app Greeter and
        // Incrementer the page render used, advancing the shared counter.
        yield* state.api.health();
        return state;
      }),
    ),
    Bdd.when`the reveal button is clicked`(
      Effect.fn("Greeting.revealButtonClicked")(function* (state) {
        yield* attempt("click the reveal button", () =>
          state.page.getByRole("button", { name: "Reveal me!" }).click(),
        );
        return state;
      }),
    ),
    Bdd.then`the reveal reports greeting ${greetingNumber}`(
      Effect.fn("Greeting.revealReportsGreeting")(function* (
        { greetingNumber: count },
        state,
      ) {
        const reveal = state.page
          .locator("p", { hasText: "at greeting #" })
          .first();
        yield* attempt("wait for the reveal to render", () => reveal.waitFor());
        const text = yield* attempt("read the reveal", () =>
          reveal.textContent(),
        );
        const expectedText = `at greeting #${count}.`;

        if (text === null || !text.includes(expectedText)) {
          return yield* Effect.fail(
            `the reveal said "${text ?? "nothing"}", expected it to report greeting #${count}`,
          );
        }

        return state;
      }),
    ),
    Bdd.provide(FetchHttpClient.layer),
  ),
);
