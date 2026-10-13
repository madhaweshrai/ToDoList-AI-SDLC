@EPMCDMETST-68567 @happy-path
Feature: Task management
  As a user of the To-Do List app
  I want to add, complete, edit and delete tasks
  So that I can keep track of what I need to do

  Background:
    Given the to-do app is open

  @TC-001
  Scenario: Application loads with its main controls
    Then the page title is "JUST DO IT"
    And the task input, priority selector, due date and add button are visible
    And the "All" filter is selected

  @TC-002
  Scenario: Add a task with a priority and due date
    When I add the task "Write report" with priority "high" and due date "2099-12-31"
    Then the task "Write report" is listed
    And the task "Write report" shows priority "high"
    And the task "Write report" shows due date "2099-12-31"
    And the new task input is empty
    And the API stores the task "Write report" with priority "high" and due date "2099-12-31"

  @TC-003
  Scenario: A task is still there after reloading the page
    Given I have added the task "Persistent task"
    When I reload the page
    Then the task "Persistent task" is listed

  @TC-004
  Scenario: Mark a task as completed and then as active again
    Given I have added the task "Toggle task"
    When I mark the task "Toggle task" as done
    Then the task "Toggle task" is shown as completed
    When I mark the task "Toggle task" as done again
    Then the task "Toggle task" is shown as active

  @TC-005
  Scenario: Edit a task title, priority and due date
    Given I have added the task "Original title" with priority "low"
    When I edit the task "Original title" to "Updated title" with priority "high" and due date "2099-01-02"
    Then the task "Updated title" is listed
    And the task "Updated title" shows priority "high"
    And the task "Updated title" shows due date "2099-01-02"
    And the task "Original title" is not listed

  @TC-006
  Scenario: Cancel editing leaves the task unchanged
    Given I have added the task "Unchanged task"
    When I start editing the task "Unchanged task" and type extra text
    And I cancel the edit
    Then the task "Unchanged task" is listed
    And no task is being edited

  @TC-007
  Scenario: Delete a task
    Given I have added the task "Disposable task"
    When I delete the task "Disposable task"
    Then the task "Disposable task" is not listed
    And the API no longer has the task "Disposable task"
