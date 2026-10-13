@EPMCDMETST-68567 @happy-path
Feature: Filter, search and clear completed tasks
  As a user with many tasks
  I want to narrow the list down and remove finished work
  So that I can focus on what is still open

  Background:
    Given the to-do app is open

  @TC-008
  Scenario: Filter tasks by Active and Completed
    Given I have added the task "Open item"
    And I have added the task "Finished item"
    And I have marked the task "Finished item" as done
    When I select the "Active" filter
    Then the task "Open item" is listed
    And the task "Finished item" is not listed
    When I select the "Completed" filter
    Then the task "Finished item" is listed
    And the task "Open item" is not listed
    When I select the "All" filter
    Then the task "Open item" is listed
    And the task "Finished item" is listed

  @TC-009
  Scenario: Search narrows the list to matching tasks
    Given I have added the task "Alpha search task"
    And I have added the task "Beta search task"
    When I search for "Alpha search task"
    Then only the task "Alpha search task" is listed

  @TC-010 @clears-completed
  Scenario: Clear all completed tasks
    Given I have added the task "Completed to clear"
    And I have marked the task "Completed to clear" as done
    When I click "Clear completed"
    Then the task "Completed to clear" is not listed
    And the API has no completed tasks
