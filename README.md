
# To-Do-List

## A To-Do website with a Node.js REST API and SQLite storage

![ToDoList](https://socialify.git.ci/tusharnankani/ToDoList/image?description=1&forks=1&issues=1&language=1&owner=1&pattern=Brick%20Wall&pulls=1&stargazers=1&theme=Dark)

#### Original project: [tusharnankani/ToDoList](https://github.com/tusharnankani/ToDoList). This fork: [madhaweshrai/ToDoList](https://github.com/madhaweshrai/ToDoList)

### *Features*:

* Tasks are stored in SQLite behind a REST API, so completion state survives reloads
* Add, edit, complete and delete tasks; each task has a priority (low/medium/high) and an optional due date
* Filter All / Active / Completed, search by title, and clear all completed tasks
* Blank input is rejected with an inline message
* Live clock (updates every second)
* Responsive, on all devices
* Three themes (standard, light, darker); the choice is remembered in `localStorage`
* Accessible controls: labelled icon buttons, real `<button>` theme selectors, visible keyboard focus

### *Requirements*

* Node.js 20 or newer (the dependency `better-sqlite3` is a native module)
* Optional: Docker with Compose

### *Quick start*

```bash
npm ci            # or: npm install
npm run db:init   # creates data/todos.db and inserts sample tasks (optional)
npm start         # http://localhost:3000
```

The server creates the database schema automatically on start, so `db:init` is only needed
if you want the sample data. `db:init` is safe to re-run: the seed only inserts into an empty table.

Open <http://localhost:3000>. The page must be served by the Node server, because it calls
`/api/todos` on the same origin; opening `index.html` directly from disk will show a "could not reach the server" message.

### *Configuration*

| Variable  | Default            | Purpose                      |
|-----------|--------------------|------------------------------|
| `PORT`    | `3000`             | HTTP port                    |
| `DB_PATH` | `data/todos.db`    | SQLite file (`:memory:` works for throwaway runs) |

### *Project layout*

```
backend/        Express app: routes -> service -> repository
  server.js       entry point
  src/routes/     HTTP only (parse request, send response)
  src/services/   validation and business rules
  src/repositories/  SQL (prepared statements) and row mapping
db/             schema.sql, seed.sql, init.js (npm run db:init)
index.html, CSS/, JS/, assets/   the browser app
tests/api/      Jest + Supertest API tests
tests/unit/     Jest unit tests (validation, service, repository, frontend via jsdom)
scripts/        build.sh, build.ps1
Dockerfile, docker-compose.yml
```

### *REST API*

Base path `/api`. Bodies and responses are JSON. Todo objects look like:

```json
{
  "id": 1,
  "title": "Buy milk",
  "completed": false,
  "priority": "medium",
  "dueDate": "2030-01-15",
  "createdAt": "2030-01-01T09:00:00.000Z",
  "updatedAt": "2030-01-01T09:00:00.000Z"
}
```

| Method & path | Description | Success |
|---|---|---|
| `GET /api/health` | Liveness check, returns `{"status":"ok"}` | 200 |
| `GET /api/todos` | List todos. Optional filters: `status=all\|active\|completed`, `priority=low\|medium\|high`, `q=<text>` (case-insensitive title search) | 200 |
| `GET /api/todos/:id` | Get one todo | 200 |
| `POST /api/todos` | Create. `title` required (1-200 chars after trimming); optional `priority` (default `medium`), `dueDate` (`YYYY-MM-DD` or `null`), `completed` | 201 |
| `PUT /api/todos/:id` | Update. Send any subset of `title`, `completed`, `priority`, `dueDate`; at least one is required | 200 |
| `DELETE /api/todos/:id` | Delete one todo | 204 |
| `DELETE /api/todos?completed=true` | Delete every completed todo, returns `{"deleted": <count>}` | 200 |

Errors use the shape `{"error": {"message": "...", "details": [{"field": "...", "message": "..."}]}}`:
`400` for invalid input or ids and malformed JSON, `404` for unknown ids and routes,
`413` for bodies over 10 KB, `500` for unexpected failures (with a generic message).

### *Testing*

```bash
npm test          # all tests
npm run test:api  # Supertest API tests (in-memory SQLite)
npm run test:unit # validation, service, repository and frontend (jsdom) tests
```

Tests use in-memory databases and a mocked `fetch`, so they need no network or running server.

### *Build a release archive*

Produces `dist/todolist-<version>.zip` (version from `package.json`) after running the tests.
The archive holds the app, database scripts, `Dockerfile` and `docker-compose.yml` but not `node_modules`
(`better-sqlite3` is platform specific); run `npm ci --omit=dev` after unzipping.

```bash
npm run build                 # bash scripts/build.sh   (Linux, macOS, Git Bash)
npm run build:win             # PowerShell scripts/build.ps1
SKIP_TESTS=1 bash scripts/build.sh      # skip the test run
powershell -File scripts/build.ps1 -SkipTests
```

`build.sh` needs `zip` or `python3` to create the archive.

### *Docker*

```bash
docker compose up --build      # http://localhost:3000
docker compose exec app npm run db:init   # optional sample data
```

Data lives in the `todo-data` named volume (`/app/data` in the container), so it survives restarts and rebuilds.
The image is based on `node:20-bookworm-slim`, runs as the unprivileged `node` user and has a health check on `/api/health`.
The Dockerfile uses `npm ci`, so commit `package-lock.json`.

### *Features to be added*:

Check [Issues](https://github.com/tusharnankani/ToDoList/issues) for contributing to this repository.

* SubTasks: Adding subtasks to the enlisted tasks, could be an option.
* Neumorphic Interface: For the to-do's so, it looks more appealing, Can use SASS (.scss file)
* ScratchPad: Adding an option of a Scratch pad and it can be locally saved.
* Login Features: users could log in and see their own To-Dos on any device.
* Reminder/Alerts: Sending automated mails once logged in, and due date/time set.

# *References*

* For Fonts: [Google Fonts](https://fonts.googleapis.com/css2?family=Work+Sans:wght@300&display=swap)
* For Basic Icons (like Trash and Check buttons): [font-awesome](https://fontawesome.com)
* For Favicon: [icons8](https://icons8.com/icons/)
* For Color Coordination: [w3schools](https://www.w3schools.com/colors/colors_mixer.asp?colorbottom=000000&colortop=FFFFFF)
* For JavaScript (Tutorial): [The Net Ninja](https://www.youtube.com/playlist?list=PL4cUxeGkcC9i9Ae2D9Ee1RvylH38dKuET)
* For help with CSS: [CSS Tricks](https://css-tricks.com/)
* For more CSS effects: [text-effects](https://speckyboy.com/underline-text-effects-css/)
* For Type Writing effects: [Type-effects](https://usefulangle.com/post/85/css-typewriter-animation)
* For Local Storage (still used for the theme): [Web Dev Simplified Blog](https://blog.webdevsimplified.com/2020-08/cookies-localStorage-sessionStorage/)

# *Contributions*

- All contributors are most welcome! This is definitely open source!
- View the [`CONTRIBUTING.md`](https://github.com/tusharnankani/ToDoList/blob/master/CONTRIBUTING.md) for further instructions, requirements/dependencies & local project setup instructions!
- All the contributors to this repository can be found in the [`CONTRIBUTORS.md`](https://github.com/tusharnankani/ToDoList/blob/master/CONTRIBUTORS.md) file!

## *WEBSITE DEMO*

![Screenshot (771)](https://user-images.githubusercontent.com/61280281/99399713-0844b900-290c-11eb-8d7c-1199319b4a9e.png)

![Screenshot (772)](https://user-images.githubusercontent.com/61280281/99399731-0da20380-290c-11eb-8a59-e0a2e5f9b19f.png)

![Screenshot (773)](https://user-images.githubusercontent.com/61280281/99399728-0d096d00-290c-11eb-9ee5-59cc8358676c.png)

![Screenshot (774)](https://user-images.githubusercontent.com/61280281/99399723-0b3fa980-290c-11eb-8728-03d974be548d.png)

# *Author*

* Tushar Nankani (tusharnankani, tusharnankani3@gmail.com)
  - [LinkedIn](https://www.linkedin.com/in/tusharnankani)
