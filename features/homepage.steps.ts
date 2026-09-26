import { Bdd } from "effect-bdd";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { createApp } from "../app.ts";
import { Greeter, Language } from "../greeter.ts";
import { startApp } from "../server.ts";

const expected = Bdd.capture("expected", Schema.String);
const language = Bdd.capture("language", Language);

export const homePage = Bdd.feature("Home page").pipe(
  Bdd.scenario("Greeting visitors").pipe(
    Bdd.given`the app is ready to start`(
      Effect.fn("Home.appIsReady")(function* () {
        return { app: createApp({ dev: false }) };
      }),
    ),
    Bdd.given`the greeter is in ${language}`(
      Effect.fn("Home.greeterIsIn")(function* (
        { language }: { readonly language: Language },
        { app }: { readonly app: ReturnType<typeof createApp> },
      ) {
        return { app, greeter: Greeter.layerFor(language) };
      }),
    ),
    Bdd.when`the app is running`(
      Effect.fn("Home.appIsRunning")(function* ({ app, greeter }: {
        readonly app: ReturnType<typeof createApp>;
        readonly greeter: Layer.Layer<Greeter>;
      }) {
        const port = yield* app.pipe(HttpRouter.provideRequest(greeter), startApp(0));
        return `http://localhost:${port}`;
      }),
    ),
    Bdd.then`the home page says ${expected}`(
      Effect.fn("Home.homePageSays")(function* (
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
