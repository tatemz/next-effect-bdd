Feature: Health check

  Scenario: The health endpoint greets with the app's greeter
    Given a POC app with a counting greeter
    When the app starts listening
    Then the health check says status ok and greeting Hello #1!
    And the home page says Hello #2!
