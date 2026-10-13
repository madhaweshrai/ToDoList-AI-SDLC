const { BeforeAll, AfterAll, Before, After, Status } = require('@cucumber/cucumber');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { shared, api, RUN_ID } = require('./world');

BeforeAll(async () => {
  const options = new chrome.Options().addArguments('--window-size=1280,900');
  if (process.env.HEADED !== '1') options.addArguments('--headless=new');
  shared.driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
});

AfterAll(async () => {
  if (shared.driver) await shared.driver.quit();
});

Before(async function () {
  await this.openApp();
});

Before({ tags: '@clears-completed' }, async function () {
  this.completedBefore = (await api('/todos')).filter((todo) => todo.completed);
});

After(async function (scenario) {
  if (scenario.result && scenario.result.status === Status.FAILED) {
    const png = await this.driver.takeScreenshot();
    this.attach(png, 'base64:image/png');
  }

  for (const todo of await api('/todos')) {
    if (todo.title.endsWith(RUN_ID)) await api(`/todos/${todo.id}`, { method: 'DELETE' });
  }

  // "Clear completed" also removes pre-existing completed tasks; restore them
  if (this.completedBefore) {
    const present = new Set((await api('/todos')).map((todo) => todo.title));
    for (const todo of this.completedBefore) {
      if (present.has(todo.title)) continue;
      const restored = await api('/todos', {
        method: 'POST',
        body: JSON.stringify({ title: todo.title, priority: todo.priority, dueDate: todo.dueDate }),
      });
      await api(`/todos/${restored.id}`, { method: 'PUT', body: JSON.stringify({ completed: true }) });
    }
  }
});
