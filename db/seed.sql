-- Inserts sample rows only when the table is empty, so it is safe to re-run.
-- Each row gets a lowercase v4 UUID generated in SQL (randomblob/random are evaluated per row).
INSERT INTO todos (id, title, completed, priority, due_date)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
       substr(lower(hex(randomblob(2))), 2) || '-' ||
       substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
       lower(hex(randomblob(6))),
       column1, column2, column3, column4
FROM (VALUES
    ('Read the project plan',            1, 'medium', NULL),
    ('Write the API tests',              0, 'high',   '2030-01-15'),
    ('Review the pull request',          0, 'medium', '2030-01-20'),
    ('Water the plants',                 0, 'low',    NULL),
    ('Deploy the app with Docker',       0, 'high',   '2030-02-01')
)
WHERE (SELECT COUNT(*) FROM todos) = 0;
