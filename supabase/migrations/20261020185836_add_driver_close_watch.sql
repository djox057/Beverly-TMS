alter table public.drivers add column if not exists close_watch boolean not null default false;

-- Lloyd Burleigh is stored as Burleigh Lloyd in APS.
with requested(name, company) as (values
('alexander medina','AP Silver Trans LLC'),
('aaron wright','AP Silver Trans LLC'),
('bryan pritchard','AP Silver Trans LLC'),
('raymond brooks','AP Silver Trans LLC'),
('rammadan mohamed','AP Silver Trans LLC'),
('artemio perez','AP Silver Trans LLC'),
('robert zerba','AP Silver Trans LLC'),
('israel gonzalez','AP Silver Trans LLC'),
('mohamed diaby','AP Silver Trans LLC'),
('robert moore','AP Silver Trans LLC'),
('ed becton varner','AP Silver Trans LLC'),
('anthony oxendine','AP Silver Trans LLC'),
('richard reynolds','AP Silver Trans LLC'),
('jeremy smith hill','AP Silver Trans LLC'),
('burleigh lloyd','AP Silver Trans LLC'),
('katherine ogeese','AP Silver Trans LLC'),
('willie moncrief','AP Silver Trans LLC'),
('john enold','United Enterprise Solutions INC'),
('wenoka graham','United Enterprise Solutions INC'),
('vanwick mason','United Enterprise Solutions INC'),
('ryan sloan','United Enterprise Solutions INC'),
('mark arteaga','United Enterprise Solutions INC'),
('dave agnant','United Enterprise Solutions INC'),
('labrian robinson','United Enterprise Solutions INC'),
('jackson joachim','United Enterprise Solutions INC'),
('keith cook','United Enterprise Solutions INC')
)
update public.drivers d set close_watch = true
from requested r, public.companies c
where c.id = d.company_id and c.name = r.company
and lower(regexp_replace(trim(d.name), '\s+', ' ', 'g')) = r.name;
