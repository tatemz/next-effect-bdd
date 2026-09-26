import { Bdd } from "effect-bdd";
import { Duration, Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
  HttpRouter,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Greeter, Language } from "../domain/greeter.ts";
import { Api, type ApiClient } from "../server/api.ts";
import { appProduction } from "../server/app.ts";
import { startApp } from "../server/pipeline.ts";

const language = Bdd.capture("language", Language);
const status = Bdd.capture("status", Schema.String);
const greeting = Bdd.capture("greeting", Schema.String);
const expected = Bdd.capture("expected", Schema.String);

/** The unstarted app plus the greeter the scenario wants injected into it. */
interface AppWithGreeter {
  readonly app: typeof appProduction;
  readonly greeter: Layer.Layer<Greeter>;
}

/**
 * State after "the app is running": the base URL and the typed `Api` client
 * bound to it. Later steps call the API through `api`, so requests and
 * responses are Schema-encoded/decoded and checked at compile time against
 * the server's endpoint definitions - no hand-rolled fetch + body parsing.
 */
interface AppRunning extends AppWithGreeter {
  readonly url: string;
  readonly api: ApiClient;
}

/** Boot the app on an ephemeral port and hand back its URL + typed client. */
const startWithClient = ({ app, greeter }: AppWithGreeter) =>
  Effect.gen(function* () {
    const port = yield* app.pipe(
      HttpRouter.provideRequest(greeter),
      startApp(0),
    );

    const url = `http://localhost:${port}`;
    const api = yield* HttpApiClient.make(Api, {
      baseUrl: url,
    });

    return {
      url,
      api,
    };
  });

const appWithGreeter = Effect.fn("Greeting.appWithGreeter")(
  function* ({ language }: { language: Language }) {
    const greeter = Greeter.layerFor(language);

    return {
      app: appProduction,
      greeter,
    };
  },
);

export const greetingVisitors = Bdd.feature("Greeting visitors").pipe(
  Bdd.scenario("The home page greets in the chosen language").pipe(
    Bdd.given`a POC app with the ${language} greeter`(appWithGreeter),
    Bdd.when`the app is running`(
      Effect.fn("Greeting.appIsRunning")(function* (state: AppWithGreeter) {
        const client = yield* startWithClient(state);

        return {
          ...state,
          ...client,
        };
      }),
    ),
    Bdd.then`the home page says ${expected}`(
      Effect.fn("Greeting.homePageSays")(function* (
        { expected },
        state: AppRunning,
      ) {
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
    Bdd.given`a POC app with the ${language} greeter`(appWithGreeter),
    Bdd.when`the app is running`(
      Effect.fn("Greeting.appIsRunning")(function* (state: AppWithGreeter) {
        const client = yield* startWithClient(state);

        return {
          ...state,
          ...client,
        };
      }),
    ),
    Bdd.then`the health check says status ${status} and greeting ${greeting}`(
      Effect.fn("Greeting.healthCheckSays")(function* (
        { greeting, status },
        state: AppRunning,
      ) {
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
    Bdd.given`a POC app with the ${language} greeter`(appWithGreeter),
    Bdd.when`the app is running`(
      Effect.fn("Greeting.appIsRunning")(function* (state: AppWithGreeter) {
        const client = yield* startWithClient(state);

        return {
          ...state,
          ...client,
        };
      }),
    ),
    Bdd.then`the swagger docs and openapi document are served`(
      Effect.fn("Greeting.docsAreServed")(function* (state: AppRunning) {
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
);
