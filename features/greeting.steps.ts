import { Bdd } from "effect-bdd";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";
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
      Effect.fn("Greeting.appWithGreeter")(function* ({ language }: {
        readonly language: Language;
      }) {
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
      Effect.fn("Greeting.homePageSays")(function* (
        { expected }: { readonly expected: string },
        url: string,
      ) {
        const body = yield* Effect.promise(() => fetch(url).then((response) => response.text()));
        if (!body.includes(`<main id="message">${expected}</main>`)) {
          return yield* Effect.fail(`home page at ${url} did not say ${expected}`);
        }
        return url;
      }),
    ),
  ),
  Bdd.scenario("The health check reports the configured greeter").pipe(
    Bdd.given`a POC app with the ${language} greeter`(
      Effect.fn("Greeting.appWithGreeter")(function* ({ language }: {
        readonly language: Language;
      }) {
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
      Effect.fn("Greeting.healthCheckSays")(function* (
        { greeting, status }: { readonly greeting: string; readonly status: string },
        url: string,
      ) {
        const json = yield* Effect.tryPromise({
          try: () => fetch(`${url}/health`).then((response) => response.json() as unknown),
          catch: (cause) => `health check fetch failed: ${cause}`,
        });
        const body = yield* Schema.decodeUnknownEffect(HealthBody)(json);
        if (body.status !== status) {
          return yield* Effect.fail(`health status was ${body.status}, expected ${status}`);
        }
        if (body.greeting !== greeting) {
          return yield* Effect.fail(`health greeting was ${body.greeting}, expected ${greeting}`);
        }
        return url;
      }),
    ),
  ),
);
