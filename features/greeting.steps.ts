import { Bdd } from "effect-bdd";
import { Duration, Effect, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
  HttpRouter,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Greeter, Language } from "../domain/greeter.ts";
import { Api } from "../server/api.ts";
import { appProduction } from "../server/app.ts";
import { startApp } from "../server/pipeline.ts";

const language = Bdd.capture("language", Language);
const status = Bdd.capture("status", Schema.String);
const greeting = Bdd.capture("greeting", Schema.String);
const expected = Bdd.capture("expected", Schema.String);

export const greetingVisitors = Bdd.feature("Greeting visitors").pipe(
  Bdd.scenario("The home page greets in the chosen language").pipe(
    Bdd.given`a POC app with the ${language} greeter`(
      Effect.fn("Greeting.appWithGreeter")(function* ({ language }) {
        return {
          app: appProduction,
          greeter: Greeter.layerFor(language),
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
          greeter: Greeter.layerFor(language),
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
          greeter: Greeter.layerFor(language),
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
);
