CREATE TABLE project_html_film_threads (
  project_id TEXT NOT NULL REFERENCES projects(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  conversation_id TEXT UNIQUE NOT NULL REFERENCES conversations(id),
  PRIMARY KEY(project_id,owner_id)
);
