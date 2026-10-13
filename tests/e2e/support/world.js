const { setWorldConstructor, World, setDefaultTimeout } = require('@cucumber/cucumber');
const { By, Key, until } = require('selenium-webdriver');

setDefaultTimeout(30 * 1000);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TIMEOUT = 10000;
const RUN_ID = `[e2e-${Date.now().toString(36)}]`;

const shared = { driver: null };
const tid = (id) => By.css(`[data-testid="${id}"]`);

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return response.status === 204 ? null : response.json();
}

class TodoWorld extends World {
  get driver() {
    return shared.driver;
  }

  fullTitle(name) {
    return `${name} ${RUN_ID}`;
  }

  async openApp() {
    const { driver } = this;
    await driver.get(BASE_URL);
    await driver.executeScript('window.localStorage.clear()');
    await driver.navigate().refresh();
    await this.waitForListLoaded();
  }

  async waitForListLoaded() {
    await this.driver.wait(
      async () =>
        (await this.driver.findElements(By.css('[data-testid="todo-item"], [data-testid="empty-state"]'))).length > 0,
      TIMEOUT,
      'task list did not load',
    );
  }

  async setDate(testid, value) {
    await this.driver.executeScript(
      "arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));",
      await this.driver.findElement(tid(testid)),
      value,
    );
  }

  async addTask(name, { priority, due } = {}) {
    const { driver } = this;
    await driver.findElement(tid('todo-input')).sendKeys(this.fullTitle(name));
    if (priority) {
      await driver.findElement(By.css(`[data-testid="priority-input"] option[value="${priority}"]`)).click();
    }
    if (due) await this.setDate('due-input', due);
    await driver.findElement(tid('add-btn')).click();
    return this.waitForTask(name);
  }

  findTask(name) {
    return this.driver.executeScript(
      `return [...document.querySelectorAll('[data-testid="todo-item"]')].find(
        (li) => li.querySelector('[data-testid="todo-title"]')?.textContent === arguments[0]) || null;`,
      this.fullTitle(name),
    );
  }

  async waitForTask(name) {
    let found = null;
    await this.driver.wait(
      async () => {
        found = await this.findTask(name);
        return found !== null;
      },
      TIMEOUT,
      `task "${name}" did not appear`,
    );
    return found;
  }

  async waitForNoTask(name) {
    await this.driver.wait(async () => (await this.findTask(name)) === null, TIMEOUT, `task "${name}" is still listed`);
  }

  async waitForCompletedState(name, completed) {
    await this.driver.wait(
      () =>
        this.driver.executeScript(
          `const li = [...document.querySelectorAll('[data-testid="todo-item"]')].find(
            (el) => el.querySelector('[data-testid="todo-title"]')?.textContent === arguments[0]);
          return !!li && li.classList.contains('completed') === arguments[1];`,
          this.fullTitle(name),
          completed,
        ),
      TIMEOUT,
      `task "${name}" did not become ${completed ? 'completed' : 'active'}`,
    );
  }

  listedTitles() {
    return this.driver.executeScript(
      "return [...document.querySelectorAll('[data-testid=\"todo-title\"]')].map((el) => el.textContent);",
    );
  }

  async apiTodo(name) {
    return (await api('/todos')).find((todo) => todo.title === this.fullTitle(name));
  }

  async waitForTheme(theme) {
    await this.driver.wait(
      async () => (await this.driver.findElement(By.css('body')).getAttribute('class')).split(' ').includes(theme),
      TIMEOUT,
      `page did not switch to the ${theme} theme`,
    );
  }
}

setWorldConstructor(TodoWorld);

module.exports = { shared, api, tid, BASE_URL, RUN_ID, TIMEOUT, By, Key, until };
