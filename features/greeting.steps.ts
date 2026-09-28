import { Bdd } from "effect-bdd";
import { Context, Duration, Effect, Layer, Schema } from "effect";
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
import { appProduction } from "../server/app.ts";
import { startApp } from "../server/pipeline.ts";

const language = Bdd.capture("language", Language);
const status = Bdd.capture("status", Schema.String);
const greeting = Bdd.capture("greeting", Schema.String);
const expected = Bdd.capture("expected", Schema.String);
const greetingNumber = Bdd.capture("greetingNumber", Schema.FiniteFromString);

/**
 * Runs a Playwright promise-returning call as an Effect, naming the call in
 * the failure so a browser timeout says which interaction timed out.
 */
const attempt = <A>(label: string, f: () => Promise<A>) =>
  Effect.tryPromise({
    try: f,
    catch: (cause) =>
      `${label}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

/**
 * A headless browser for one scenario.
 *
 * Mirrors the `BrowserPage` pattern from the effect-bdd docs: the browser is
 * acquired when the scenario's provider layer builds and closed when the
 * scenario's scope closes, so a crashed or hung page cannot leak a Chromium
 * process into the next scenario.
 */
class Browser extends Context.Service<
  Browser,
  {
    /** A fresh page in this scenario's browser. */
    readonly newPage: Effect.Effect<Page, string>;
  }
>()("Browser") {}

const browserLayer = Layer.effect(
  Browser,
  Effect.gen(function* () {
    const chromiumBrowser = yield* attempt("launch chromium", () =>
      chromium.launch(),
    );
    yield* Effect.addFinalizer(() =>
      Effect.tryPromise(() => chromiumBrowser.close()).pipe(Effect.ignore),
    );
    return Browser.of({
      newPage: attempt("open a page", () => chromiumBrowser.newPage()),
    });
  }),
);

export const greetingVisitors = Bdd.feature("Greeting visitors").pipe(
  Bdd.scenario("The home page greets in the chosen language").pipe(
    Bdd.given`a POC app with the ${language} greeter`(
      Effect.fn("Greeting.appWithGreeter")(function* ({ language }) {
        return {
          app: appProduction,
          greeter: Layer.provideMerge(
            Greeter.layerFor(language),
            Incrementer.greetingCountLayer,
          ),
        };
      }),
    ),
    Bdd.when`the app is running`(
      Effect.fn("Greeting.appIsRunning")(function* (state) {
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
    ),
    Bdd.then`the home page says ${expected}`(
      Effect.fn("Greeting.homePageSays")(function* ({ expected }, state) {
        // Artificial delay to test parallelization.
        yield* Effect.sleep(Duration.seconds(3));

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
    Bdd.given`a POC app with the ${language} greeter`(
      Effect.fn("Greeting.appWithGreeter")(function* ({ language }) {
        return {
          app: appProduction,
          greeter: Layer.provideMerge(
            Greeter.layerFor(language),
            Incrementer.greetingCountLayer,
          ),
        };
      }),
    ),
    Bdd.when`the app is running`(
      Effect.fn("Greeting.appIsRunning")(function* (state) {
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
    ),
    Bdd.then`the health check says status ${status} and greeting ${greeting}`(
      Effect.fn("Greeting.healthCheckSays")(function* ({ greeting, status }, state) {
        // Artificial delay to test parallelization.
        yield* Effect.sleep(Duration.seconds(3));
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
    Bdd.given`a POC app with the ${language} greeter`(
      Effect.fn("Greeting.appWithGreeter")(function* ({ language }) {
        return {
          app: appProduction,
          greeter: Layer.provideMerge(
            Greeter.layerFor(language),
            Incrementer.greetingCountLayer,
          ),
        };
      }),
    ),
    Bdd.when`the app is running`(
      Effect.fn("Greeting.appIsRunning")(function* (state) {
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
    ),
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
    Bdd.given`a POC app with the ${language} greeter`(
      Effect.fn("Greeting.appWithGreeter")(function* ({ language }) {
        return {
          app: appProduction,
          greeter: Layer.provideMerge(
            Greeter.layerFor(language),
            Incrementer.greetingCountLayer,
          ),
        };
      }),
    ),
    Bdd.when`the app is running`(
      Effect.fn("Greeting.appIsRunning")(function* (state) {
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
    ),
    Bdd.when`a browser opens the home page`(
      Effect.fn("Greeting.browserOpensHomePage")(function* (state) {
        const browser = yield* Browser;
        const page = yield* browser.newPage;
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
    Bdd.provide(Layer.mergeAll(FetchHttpClient.layer, browserLayer)),
  ),
);
