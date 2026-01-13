-- Fix the December 2025 calculated_salary for Darko Janosevic - Danny
-- The actual calculated salary was $3,835.49, but $3,763.49 was incorrectly saved
-- This will allow January 2026 to correctly show the $72 underpayment adjustment

UPDATE dispatcher_salary_payments 
SET calculated_salary = 3835.49 
WHERE user_id = 'd86a44ce-fdfb-4eb8-9671-8224f4bdda2e' 
AND month = '2025-12';