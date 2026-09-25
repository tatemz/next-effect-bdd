import { Bdd } from "effect-bdd";
import { Effect, Function, Layer, Schema, Scope } from "effect";
import { type AppPending, type AppProvided, makeApp, provideDeps, start } from "../app.ts";
import { Greeter, GreeterEnglish, GreeterSpanish } from "../greeter.ts";

const Language = Schema.Literals(["en", "es"]);
const expected = Bdd.capture("expected", Schema.String);
const language = Bdd.capture("language", Language);

const greeterLayers: Record<typeof Language.Type, Layer.Layer<Greeter>> = {
  en: GreeterEnglish,
  es: GreeterSpanish,
};

type Make = Effect.Effect<AppPending, unknown, Scope.Scope>;
type Provide = (make: Make) => Effect.Effect<AppProvided, unknown, Scope.Scope>;

interface PipelineParts {
  readonly make: Make;
  readonly provide: Provide;
}

/**
 * `Given the app is ready to start` - the scenario state is the *pipeline
 * value* `makeApp(0)`: a lazy description of a prepared app. Nothing is
 * prepared or served until a later step runs it.
 */
const givenAppIsReady = Bdd.given`the app is ready to start`(() =>
  Effect.succeed({ make: makeApp(0) }),
);

/**
 * `Given the greeter is in <language>` - chooses which Greeter layer the
 * pipeline will be provided.
 */
const givenGreeterIsIn = Bdd.given`the greeter is in ${language}`(
  ({ language }: { readonly language: typeof Language.Type }, { make }: { readonly make: Make }) =>
    Effect.succeed<PipelineParts>({ make, provide: provideDeps(greeterLayers[language]) }),
);

/** `When the app is running` - runs `pipe(makeApp(), provideDeps(), start())`. */
const whenAppIsRunning = Bdd.when`the app is running`(
  ({ make, provide }: PipelineParts) =>
    Effect.map(Function.pipe(make, provide, start), (port) => `http://localhost:${port}`),
);

const thenHomePageSays = Bdd.then`the home page says ${expected}`(
  ({ expected }: { readonly expected: string }, url: string) =>
    Effect.gen(function* () {
      const body = yield* Effect.promise(() => fetch(url).then((response) => response.text()));
      if (body.includes(`<main id="message">${expected}</main>`)) {
        return url;
      }
      return yield* Effect.fail(`home page at ${url} did not say ${expected}`);
    }),
);

const greetingVisitors = Bdd.scenario("Greeting visitors").pipe(
  givenAppIsReady,
  givenGreeterIsIn,
  whenAppIsRunning,
  thenHomePageSays,
);

export const homePage = Bdd.feature("Home page").pipe(greetingVisitors);
