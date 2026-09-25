Feature: Home page

  Scenario Outline: Greeting visitors
    Given the app is ready to start
    Given the greeter is in <language>
    When the app is running
    Then the home page says <expected>

    Examples:
      | language | expected |
      | en       | Hello!   |
      | es       | ¡Hola!   |
