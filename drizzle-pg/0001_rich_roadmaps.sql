ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "current_phase" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "roadmap" text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "projects" SET
  "current_phase" = CASE "id"
    WHEN 'silkfutures' THEN 'Silkfutures 2.0 and Alchemy relaunch'
    WHEN 'set-pace' THEN 'Rebuilding the season around Love in Motion'
    WHEN 'silkcrayon' THEN 'Stabilising the new booking and studio operating system'
    WHEN 'codex-iso' THEN 'Building the first trustworthy collection'
    WHEN 'music' THEN 'Reconnecting output with an authentic artist identity'
    WHEN 'personal' THEN 'Building a stable physical, financial and domestic base'
    ELSE "current_phase"
  END,
  "roadmap" = CASE "id"
    WHEN 'silkfutures' THEN 'Build a committed core through the 24-week Alchemy pathway, Benny-led Discovery Sessions and the five-stage progression model.'
    WHEN 'set-pace' THEN 'Create a sustainable rhythm across juniors, adults and the run club, then strengthen the community through shared challenges and events.'
    WHEN 'silkcrayon' THEN 'Complete the client journey from discovery and booking through payment, delivery and return visits, then develop the strongest artists through Silk Records.'
    WHEN 'codex-iso' THEN 'Establish the complete-edition production pipeline, grow towards 100 then 500 titles, and build the Map of Truth discovery layer.'
    WHEN 'music' THEN 'Finish the strongest existing music, clarify the artistic world and build genuine audience depth before expanding into community products.'
    WHEN 'personal' THEN 'Protect recovery and health, create financial clarity and build routines that support the next creative and business season.'
    ELSE "roadmap"
  END
WHERE "current_phase" = '' OR "roadmap" = '';
