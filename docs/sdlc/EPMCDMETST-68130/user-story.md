# User Story — EPMCDMETST-68130

**Source:** https://jiraeu.epam.com/browse/EPMCDMETST-68130 (content supplied by the user on 2026-10-14; Jira itself was not reachable from the agent)
**Project:** EPM-CDME-TEST | **Type:** Story | **Priority:** Average | **Status:** Open | **Labels:** ai-sdlc, frontend

## Summary

As a user, I want todos stored as structured objects with stable IDs so that duplicate tasks and future metadata are handled reliably.

## Background / Problem

Currently todos are persisted as an array of plain strings in localStorage. This causes:

- no unique identifier for a todo
- inability to support metadata (e.g., completed flag, priority, due date) without breaking format
- duplicate todo texts cannot be safely deleted/updated because lookup is done by text

## Scope (G01)

- Introduce a Todo domain model as an object (not a string)
- Add a stable unique id per todo (client-generated for now)
- Ensure localStorage persistence uses the object array
- Ensure rendering uses the todo id (e.g., as DOM data attribute)

## Notes / Implementation idea

- Data shape (minimum): `{id: string, text: string, completed: boolean, createdAt: string}`
- Use `crypto.randomUUID()` where available, with a fallback UUID generator.
- Provide a one-time migration: if localStorage contains an array of strings, convert to objects on load.

## Acceptance Criteria (Gherkin)

```gherkin
Feature: Todo domain model & stable IDs

  Scenario: Happy path - create and persist a todo object
    Given the user opens the ToDoList app
    When the user adds a todo with text "Buy milk"
    Then the app stores the todo in localStorage as an object containing a non-empty "id" and "text"="Buy milk"
    And the rendered todo element contains the same id (e.g., data-id attribute)

  Scenario: Negative - handle duplicate todo texts without ambiguity
    Given the user has two todos with text "Call mom" saved in localStorage
    When the user deletes the second "Call mom" todo in the UI
    Then only that todo with the matching id is removed from localStorage
    And the other "Call mom" todo remains visible

  Scenario: Backward compatibility - migrate legacy string storage
    Given localStorage contains a legacy todos array of strings ["A","B"]
    When the user opens the app
    Then the app migrates and stores todos as objects with ids
    And both todos are rendered correctly
```
