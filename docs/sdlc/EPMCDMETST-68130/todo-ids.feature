# Living documentation for EPMCDMETST-68130. Each scenario is verified by Jest tests whose names start with the
# scenario's AC id (see requirements.md §7). Adapted to the agreed architecture: the REST API is the store (Q1).
Feature: Todo domain model & stable IDs

  Scenario: AC-1 Happy path - create and persist a todo object
    Given the user opens the ToDoList app
    When the user adds a todo with text "Buy milk"
    Then the app persists the todo as an object containing a non-empty UUID "id" and "title"="Buy milk"
    And the rendered todo element contains the same id in its data-id attribute

  Scenario: AC-2 Negative - handle duplicate todo texts without ambiguity
    Given the user has two saved todos with text "Call mom"
    When the user deletes the second "Call mom" todo in the UI
    Then only the todo with the matching id is removed from the store
    And the other "Call mom" todo remains visible

  Scenario: AC-3 Backward compatibility - migrate legacy string storage
    Given localStorage contains a legacy todos array of strings ["A","B"]
    When the user opens the app
    Then the app converts the entries to objects with ids and imports them with those ids
    And the legacy localStorage key is removed
    And both todos are rendered correctly with their ids

  Scenario: AC-7 Legacy migration is retried without duplicates
    Given localStorage contains ["A","B","C"]
    And importing "B" fails because the server is unreachable
    When the user opens the app
    Then "B" and "C" stay in localStorage and a retry notice is shown
    When the user opens the app again and the server is reachable
    Then "B" and "C" are imported and no todo is duplicated
