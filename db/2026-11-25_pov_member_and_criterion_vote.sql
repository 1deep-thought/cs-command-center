-- Run once in BigQuery (project rosy-pivot-169701) BEFORE deploying the code that reads these.
-- pov_member is read by the PoV list, every plan page and every write; without it they fail.

-- Who is on each PoV: the assigned Account Executive ('ae') and Solution Engineer ('se') from
-- Delphina, and invited prospect users ('prospect'). A row with removed_at set grants nothing.
CREATE TABLE IF NOT EXISTS `rosy-pivot-169701.cs_pov.pov_member` (
  pov_id STRING NOT NULL,
  email STRING NOT NULL,          -- lowercased sign-in email
  role STRING NOT NULL,           -- 'ae' | 'se' | 'prospect'
  stakeholder_id STRING,          -- for 'prospect': the stakeholder record this person is
  added_by STRING NOT NULL,
  added_at TIMESTAMP NOT NULL,
  removed_at TIMESTAMP,
  removed_by STRING
) CLUSTER BY pov_id;

-- One row per (criterion, voter, kind): a prospect member's vote on a success criterion.
-- importance (before lock): 3 must have, 2 important, 1 nice to have.
-- outcome (after lock): 100 met, 50 partly met, 0 not met.
CREATE TABLE IF NOT EXISTS `rosy-pivot-169701.cs_pov.criterion_vote` (
  pov_id STRING NOT NULL,
  criterion_id STRING NOT NULL,
  voter_email STRING NOT NULL,
  kind STRING NOT NULL,           -- 'importance' | 'outcome'
  value INT64 NOT NULL,
  comment STRING,
  cast_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
) CLUSTER BY pov_id;
