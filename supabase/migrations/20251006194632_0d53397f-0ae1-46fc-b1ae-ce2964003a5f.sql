-- Add extension column to profiles table for dispatchers
ALTER TABLE public.profiles 
ADD COLUMN ext text;