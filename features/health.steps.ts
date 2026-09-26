import { Bdd } from "effect-bdd";
import { Effect, Layer, Ref, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { createApp } from "../app.ts";
import { Greeter } from "../greeter.ts";
import { startApp } from "../server.ts";

const status = Bdd.capture("status", Schema.String);
const greeting = Bdd.capture("greeting", Schema.String);
const expected = Bdd.capture("expected", Schema.String);

const HealthBody = Schema.Struct({
  status: Schema.String,
  greeting: Schema.String,
});

/**
 * Counts greetings in a `Ref`, so the assertions prove the route and the page
 * share one `Greeter` instance: health sees `#1`, the page renders `#2`.
 */
const CountingGreeter = Layer.effect(
  Greeter,
  Effect.gen(function* () {
    const count = yield* Ref.make(0);
    return Greeter.of({
      greet: () => Effect.map(Ref.updateAndGet(count, (n) => n + 1), (n) => `Hello #${n}!`),
    });
  }),
);

export const healthCheck = Bdd.feature("Health check").pipe(
  Bdd.scenario("The health endpoint greets with the app's greeter").pipe(
    Bdd.given`a POC app with a counting greeter`(
      Effect.fn("Health.appIsReady")(function* () {
        return { app: createApp({ dev: false }), greeter: CountingGreeter };
      }),
    ),
    Bdd.when`the app starts listening`(
      Effect.fn("Health.appIsRunning")(function* ({ app, greeter }: {
        readonly app: ReturnType<typeof createApp>;
        readonly greeter: Layer.Layer<Greeter>;
      }) {
        const port = yield* app.pipe(HttpRouter.provideRequest(greeter), startApp(0));
        return `http://localhost:${port}`;
      }),
    ),
    Bdd.then`the health check says status ${status} and greeting ${greeting}`(
      Effect.fn("Health.healthCheckSays")(function* (
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
    Bdd.then`the home page says ${expected}`(
      Effect.fn("Health.homePageSays")(function* (
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
);
