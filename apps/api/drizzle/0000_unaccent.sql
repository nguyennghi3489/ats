-- Accent-insensitive search (decisions §11): unaccent(lower(field)) ILIKE unaccent(lower(q)).
CREATE EXTENSION IF NOT EXISTS unaccent;
