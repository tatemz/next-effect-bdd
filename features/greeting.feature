Feature: Greeting visitors

  Every scenario runs once per mode: `production` serves the built `.next`
  output (fast), `development` boots Next in dev mode with on-demand
  compilation (slow). Same assertions, two runtimes.

  The mode split is a Gherkin data table, but the runner is two processes:
  Next 16's turbopack compile registry is process-global, so a Node process
  can host many production Next servers but only the first development one.
  `pnpm test-bdd` runs the `@prod` examples together, then each dev example
  in its own process - which is exactly why dev is the slow lane.

  Scenario Outline: The home page greets in the chosen language
    Given a POC app in <mode> mode
    And the app is using the <language> greeter
    When the app is running
    Then the home page says <expected>

    @prod
    Examples:
      | mode       | language | expected |
      | production | en       | Hello!   |
      | production | es       | ¡Hola!   |

    @dev-home-en
    Examples:
      | mode        | language | expected |
      | development | en       | Hello!   |

    @dev-home-es
    Examples:
      | mode        | language | expected |
      | development | es       | ¡Hola!   |

  Scenario Outline: The health check reports the configured greeter
    Given a POC app in <mode> mode
    And the app is using the <language> greeter
    When the app is running
    Then the health check says status ok and greeting <expected>

    @prod
    Examples:
      | mode       | language | expected |
      | production | en       | Hello!   |
      | production | es       | ¡Hola!   |

    @dev-health-en
    Examples:
      | mode        | language | expected |
      | development | en       | Hello!   |

    @dev-health-es
    Examples:
      | mode        | language | expected |
      | development | es       | ¡Hola!   |

  Scenario Outline: The docs endpoint describes the API
    Given a POC app in <mode> mode
    And the app is using the <language> greeter
    When the app is running
    Then the swagger docs and openapi document are served

    @prod
    Examples:
      | mode       | language |
      | production | en       |

    @dev-docs
    Examples:
      | mode        | language |
      | development | en       |

  Scenario Outline: The reveal counts the page view and the health check
    Given a POC app in <mode> mode
    And the app is using the en greeter
    When the app is running
    And a browser opens the home page
    And the health endpoint is hit
    And the reveal button is clicked
    Then the reveal reports greeting 2

    @prod
    Examples:
      | mode       |
      | production |

    @dev-reveal
    Examples:
      | mode        |
      | development |
