-- Inserts sample rows only when the table is empty, so it is safe to re-run.
INSERT INTO todos (title, completed, priority, due_date)
SELECT column1, column2, column3, column4
FROM (VALUES
    ('Read the project plan',            1, 'medium', NULL),
    ('Write the API tests',              0, 'high',   '2030-01-15'),
    ('Review the pull request',          0, 'medium', '2030-01-20'),
    ('Water the plants',                 0, 'low',    NULL),
    ('Deploy the app with Docker',       0, 'high',   '2030-02-01')
)
WHERE (SELECT COUNT(*) FROM todos) = 0;
