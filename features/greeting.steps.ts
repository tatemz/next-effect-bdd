import { Bdd } from "effect-bdd";
import { Duration, Effect, Layer, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
  HttpRouter,
} from "effect/unstable/http";
import { Greeter, Language } from "../domain/greeter.ts";
import { createApp } from "../server/app.ts";
import { startApp } from "../server/pipeline.ts";

const language = Bdd.capture("language", Language);
const status = Bdd.capture("status", Schema.String);
const greeting = Bdd.capture("greeting", Schema.String);
const expected = Bdd.capture("expected", Schema.String);

const HealthBody = Schema.Struct({
  status: Schema.String,
  greeting: Schema.String,
});

interface AppRunning {
  readonly app: ReturnType<typeof createApp>;
  readonly greeter: Layer.Layer<Greeter>;
}

export const greetingVisitors = Bdd.feature("Greeting visitors").pipe(
  Bdd.scenario("The home page greets in the chosen language").pipe(
    Bdd.given`a POC app with the ${language} greeter`(
      Effect.fn("Greeting.appWithGreeter")(function* ({ language }) {
        return { app: createApp({ dev: false }), greeter: Greeter.layerFor(language) };
      }),
    ),
    Bdd.when`the app is running`(
      Effect.fn("Greeting.appIsRunning")(function* ({ app, greeter }: AppRunning) {
        const port = yield* app.pipe(HttpRouter.provideRequest(greeter), startApp(0));
        return `http://localhost:${port}`;
      }),
    ),
    Bdd.then`the home page says ${expected}`(
      Effect.fn("Greeting.homePageSays")(function* ({ expected }, url: string) {
        yield* Effect.sleep(Duration.seconds(3)); // artificial delay to test parallelization
        const body = yield* HttpClient.get(url).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap((response) => response.text),
        );
        if (!body.includes(`<main id="message">${expected}</main>`)) {
          return yield* Effect.fail(`home page at ${url} did not say ${expected}`);
        }
        return url;
      }),
    ),
    Bdd.provide(FetchHttpClient.layer),
  ),
  Bdd.scenario("The health check reports the configured greeter").pipe(
    Bdd.given`a POC app with the ${language} greeter`(
      Effect.fn("Greeting.appWithGreeter")(function* ({ language }) {
        return { app: createApp({ dev: false }), greeter: Greeter.layerFor(language) };
      }),
    ),
    Bdd.when`the app is running`(
      Effect.fn("Greeting.appIsRunning")(function* ({ app, greeter }: AppRunning) {
        const port = yield* app.pipe(HttpRouter.provideRequest(greeter), startApp(0));
        return `http://localhost:${port}`;
      }),
    ),
    Bdd.then`the health check says status ${status} and greeting ${greeting}`(
      Effect.fn("Greeting.healthCheckSays")(function* ({ greeting, status }, url) {
        yield* Effect.sleep(Duration.seconds(3)); // artificial delay to test parallelization
        const body = yield* HttpClient.get(`${url}/health`).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(HealthBody)),
        );
        if (body.status !== status) {
          return yield* Effect.fail(`health status was ${body.status}, expected ${status}`);
        }
        if (body.greeting !== greeting) {
          return yield* Effect.fail(`health greeting was ${body.greeting}, expected ${greeting}`);
        }
        return url;
      }),
    ),
    Bdd.provide(FetchHttpClient.layer),
  ),
);
