const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { api, tid, By, Key, until, TIMEOUT } = require('../support/world');

// ---------- Given ----------

Given('the to-do app is open', async function () {
  await this.waitForListLoaded();
});

Given('I have added the task {string}', async function (name) {
  await this.addTask(name);
});

Given('I have added the task {string} with priority {string}', async function (name, priority) {
  await this.addTask(name, { priority });
});

Given('I have marked the task {string} as done', async function (name) {
  const item = await this.waitForTask(name);
  await item.findElement(tid('check-btn')).click();
  await this.waitForCompletedState(name, true);
});

// ---------- When ----------

When('I add the task {string} with priority {string} and due date {string}', async function (name, priority, due) {
  await this.addTask(name, { priority, due });
});

When('I reload the page', async function () {
  await this.driver.navigate().refresh();
  await this.waitForListLoaded();
});

When('I mark the task {string} as done', async function (name) {
  const item = await this.waitForTask(name);
  await item.findElement(tid('check-btn')).click();
});

When('I mark the task {string} as done again', async function (name) {
  await this.waitForCompletedState(name, true);
  const item = await this.waitForTask(name);
  await item.findElement(tid('check-btn')).click();
});

When(
  'I edit the task {string} to {string} with priority {string} and due date {string}',
  async function (name, newName, priority, due) {
    const item = await this.waitForTask(name);
    await item.findElement(tid('edit-btn')).click();
    const editInput = await this.driver.wait(until.elementLocated(tid('edit-input')), TIMEOUT);
    await editInput.sendKeys(Key.chord(Key.CONTROL, 'a'), this.fullTitle(newName));
    await this.driver.findElement(By.css(`[data-testid="edit-priority"] option[value="${priority}"]`)).click();
    await this.setDate('edit-due', due);
    await this.driver.findElement(tid('save-btn')).click();
  },
);

When('I start editing the task {string} and type extra text', async function (name) {
  const item = await this.waitForTask(name);
  await item.findElement(tid('edit-btn')).click();
  const editInput = await this.driver.wait(until.elementLocated(tid('edit-input')), TIMEOUT);
  await editInput.sendKeys('-changed');
});

When('I cancel the edit', async function () {
  await this.driver.findElement(tid('cancel-btn')).click();
});

When('I delete the task {string}', async function (name) {
  const item = await this.waitForTask(name);
  await item.findElement(tid('delete-btn')).click();
});

When('I select the {string} filter', async function (filter) {
  await this.driver.findElement(tid(`filter-${filter.toLowerCase()}`)).click();
});

When('I search for {string}', async function (name) {
  const box = await this.driver.findElement(tid('search-input'));
  await box.clear();
  await box.sendKeys(this.fullTitle(name));
});

When('I click {string}', async function (label) {
  assert.equal(label, 'Clear completed', 'only the "Clear completed" button is supported');
  await this.driver.findElement(tid('clear-completed-btn')).click();
});

When('I choose the {string} theme', async function (theme) {
  await this.driver.findElement(By.css(`button[data-theme="${theme}"]`)).click();
});

// ---------- Then ----------

Then('the page title is {string}', async function (title) {
  assert.equal(await this.driver.getTitle(), title);
});

Then('the task input, priority selector, due date and add button are visible', async function () {
  for (const id of ['todo-input', 'priority-input', 'due-input', 'add-btn']) {
    assert.ok(await this.driver.findElement(tid(id)).isDisplayed(), `${id} should be visible`);
  }
});

Then('the {string} filter is selected', async function (filter) {
  const button = await this.driver.findElement(tid(`filter-${filter.toLowerCase()}`));
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
});

Then('the task {string} is listed', async function (name) {
  await this.waitForTask(name);
});

Then('the task {string} is not listed', async function (name) {
  await this.waitForNoTask(name);
});

Then('only the task {string} is listed', async function (name) {
  await this.driver.wait(
    async () => {
      const titles = await this.listedTitles();
      return titles.length === 1 && titles[0] === this.fullTitle(name);
    },
    TIMEOUT,
    `expected only "${name}" to be listed`,
  );
});

Then('the task {string} shows priority {string}', async function (name, priority) {
  const item = await this.waitForTask(name);
  const badge = await item.findElement(tid('priority-badge')).getText();
  assert.equal(badge.toLowerCase(), priority);
});

Then('the task {string} shows due date {string}', async function (name, due) {
  const item = await this.waitForTask(name);
  assert.equal(await item.findElement(tid('due-date')).getText(), `Due ${due}`);
});

Then('the new task input is empty', async function () {
  assert.equal(await this.driver.findElement(tid('todo-input')).getAttribute('value'), '');
});

Then('the task {string} is shown as completed', async function (name) {
  await this.waitForCompletedState(name, true);
});

Then('the task {string} is shown as active', async function (name) {
  await this.waitForCompletedState(name, false);
});

Then('no task is being edited', async function () {
  assert.equal((await this.driver.findElements(tid('edit-input'))).length, 0);
});

Then('the API stores the task {string} with priority {string} and due date {string}', async function (name, priority, due) {
  const todo = await this.apiTodo(name);
  assert.ok(todo, `API should contain "${name}"`);
  assert.equal(todo.priority, priority);
  assert.equal(todo.dueDate, due);
});

Then('the API no longer has the task {string}', async function (name) {
  assert.equal(await this.apiTodo(name), undefined);
});

Then('the API has no completed tasks', async function () {
  assert.equal((await api('/todos')).filter((todo) => todo.completed).length, 0);
});

Then('the page uses the {string} theme', async function (theme) {
  await this.waitForTheme(theme);
});
