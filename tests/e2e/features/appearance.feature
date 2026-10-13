@EPMCDMETST-68567 @happy-path
Feature: Appearance
  As a user
  I want to choose a colour theme
  So that the app is comfortable to read and my choice is remembered

  Background:
    Given the to-do app is open

  @TC-011
  Scenario: The chosen theme is remembered after reloading
    When I choose the "light" theme
    Then the page uses the "light" theme
    When I reload the page
    Then the page uses the "light" theme
