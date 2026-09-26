Feature: Greeting visitors

  Scenario Outline: The home page greets in the chosen language
    Given a POC app with the <language> greeter
    When the app is running
    Then the home page says <expected>

    Examples:
      | language | expected |
      | en       | Hello!   |
      | es       | ¡Hola!   |

  Scenario Outline: The health check reports the configured greeter
    Given a POC app with the <language> greeter
    When the app is running
    Then the health check says status ok and greeting <expected>

    Examples:
      | language | expected |
      | en       | Hello!   |
      | es       | ¡Hola!   |

  Scenario Outline: The docs endpoint describes the API
    Given a POC app with the <language> greeter
    When the app is running
    Then the swagger docs and openapi document are served

    Examples:
      | language |
      | en       |
