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

  Scenario: The reveal counts the page view and the health check
    Given a POC app with the en greeter
    When the app is running
    And a browser opens the home page
    And the health endpoint is hit
    And the reveal button is clicked
    Then the reveal reports greeting 2
