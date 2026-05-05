
-- Step 1: Delete stale UES transfers where going_to_company == driver's current company
DELETE FROM public.transfer_list t
USING public.drivers d, public.companies c
WHERE t.transfer_type = 'ues'
  AND t.driver_id = d.id
  AND d.company_id = c.id
  AND t.going_to_company = c.name;

-- Step 2: Insert UES → AP Silver Trans LLC for listed drivers that don't yet have one
WITH input(name) AS (VALUES ('Reginal Jones'),('Carlos Carcamo Chevez'),('Daouda Konate'),('Augusta Silva'),('Desire Bayingana'),('Enrique Diaz'),('Katherine Ogeese'),('Tavares Boykin'),('Jerome Armour'),('Paul Dubose'),('Victor Paez'),('Charles Brown'),('Casey Binkowski'),('Terrence Wiles'),('Joseph Buras'),('Christopher Toller'),('Cody Mcadams'),('Levarr Hart'),('Richard Charles Wilkerson'),('Onan Villamil'),('Matthew Baker'),('Mahdi Hirsi'),('Michael Montgomery'),('Todd Muschall'),('Ogonnaya Udeagha'),('William Englehart'),('Raymond Girtman'),('Diogenes Domiguez'),('Samuel Peagler'),('Keith Cook'),('Jhoan Lizardo'),('Robert Bolton'),('Jimmie Hunter'),('Jonathan Lynch'),('Charles Cook'),('Larry Torrence'),('John Ray'),('Andrew Drew'),('Emanuel Burnett'),('Vernon Altenberger'),('Keith Griffin'),('Nathan Sawyer'),('Robert Hall'),('Roland Jones'),('Jeffrey Henman'),('Amefika Murray'),('Bryan Pritchard'),('Malik Jenkins'),('Tia Mays'),('Chester Dixie'),('Caleb Lerch'),('Mckinley Patterson'),('Edward Butcher'),('Timothy Guess'),('Jeffrey Cody'),('Stanley Edwards'),('Oscar Brazee'),('Dovie Jennings'),('Charles Hampton'),('Andrew Johnson'),('Wayne Anthony Dauphine'),('Dan Graves'),('Gregory Alexandre'),('James Gallman'),('Jeremy Hunter'),('Vanwick Mason'),('Tayla Joyner'),('Isaac Gayden'),('Michael Houser'),('Carl Thomas'),('Ralph Lasker'),('Richard Acker'),('Terry Tabb'),('Kwame Ealon'),('Robert Johns'),('Shawn Oneil'),('Lucsene Relavie'),('Hullio Relavie'),('Jermahl Bobbitt'),('Jeremy Cunningham'),('Dewayne Carson'),('Jose Lopez'),('Carl Merrick'),('Owen Cross'),('Robert Oliver'),('Abdourahamane Diallo'),('James Hoistion'),('Steve Plummer'),('Kenny Morales Millan'),('Stephen Kelp'),('Johnatan Celestino'),('Jarvis Martin'),('William Diaz'),('Antawn Calhoun'),('Ryan Hayward'),('Anthony Ortiz'),('Jean Henry'),('John Enold'),('Howard Tulloch'),('Tori Nelson'),('Willie Fisher'),('Askia Sisay'),('Gregory Nwele'),('Caleb Green'),('Alexandre DeAlmedia'),('Daniel Holiday'),('Patrick Morgan'),('Ronald Goldsborough'),('Wenoka Graham'),('Tyron Parks'),('Daniel Stiefel'),('Jpaul Moore'),('Andre Pickens'),('Erode Bonhomme'),('Larry Smith'),('Manterio Taylor'),('Randy Beam'),('Thomas Chandler'),('Randy Reinke'),('Tyree Threadcraft'),('Russell Barlow'),('Hernan Serrano Azuara'),('Frederick Buckley'),('Volvix St Louis'),('Claude Lambey'),('Michael Thomas'),('Lagree Walker'),('Erik Griffin'),('Carl Woods'),('Stanley Mccormick'),('Alvin Ferguson'),('Cory Donaldson'),('Aaron Hill'),('Jason Jones'),('Raymond Otero'),('Robert Rivera'),('Marlon Blake'),('Charles Helton'),('Maurilio Caro'),('G Adam Blocker'),('William Wright'),('Caleb Schuckert'),('Thomas Frazier'),('Allen Gholson'),('Federico Garcia'),('Michael Sheppard'),('David Jackson'),('Theodore Reynolds'),('Ahmed Soud'),('Thurmon Cain'),('William Bridle'),('Jordan Young'),('Randy Maring'),('Corey Cooper'),('Tellyah Stuart'),('Norene Atkins'),('Rolando Gonzalez'),('Christopher Jiles'),('Willie Moncrief'),('Kurt Kristiansen'),('Antonio Nevarez'),('Richard Kirkwood'),('Earnest Hibler'),('Ahmed Ali'),('Salvador Santos Jr'),('James Williams'),('Callashondra Cramer'),('Keith Money'),('Bert Chumley'),('Joshua Pradia'),('Kirk Hillman'),('Endale Hailu'),('Leslie Schuder'),('Carl McNeal'),('Joel Chandler'),('Mark Whipple'),('Jeremy Searle'),('Joshua Romar'),('James Watkins'),('Dieudonne Abemba'),('Darnelle Treadwell'),('Suzetta Griffith'),('Miguel Vacacela'),('Nikolos Yarde'),('Leonard Smith'),('Marc Andre'),('Gary Shepherd')),
list_drivers AS (
  SELECT DISTINCT ON (d.id) d.id AS driver_id, c.name AS company_name
  FROM input i
  JOIN public.drivers d ON LOWER(d.name) = LOWER(i.name)
  LEFT JOIN public.companies c ON c.id = d.company_id
)
INSERT INTO public.transfer_list (driver_id, truck_id, going_to_company, transfer_type)
SELECT
  ld.driver_id,
  (SELECT t.id FROM public.trucks t WHERE t.driver1_id = ld.driver_id OR t.driver2_id = ld.driver_id LIMIT 1),
  'AP Silver Trans LLC',
  'ues'
FROM list_drivers ld
WHERE ld.company_name IS DISTINCT FROM 'AP Silver Trans LLC'
  AND NOT EXISTS (
    SELECT 1 FROM public.transfer_list tl
    WHERE tl.driver_id = ld.driver_id
      AND tl.transfer_type = 'ues'
      AND tl.going_to_company = 'AP Silver Trans LLC'
  );
