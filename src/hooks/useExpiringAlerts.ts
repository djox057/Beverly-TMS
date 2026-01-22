import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000; // 60 days in milliseconds

export const useExpiringTrucks = () => {
  return useQuery({
    queryKey: ['expiring-trucks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select(`
          *,
          driver1:drivers!trucks_driver1_id_fkey(id, name, company:companies!company_id(id, name)),
          driver2:drivers!trucks_driver2_id_fkey(id, name),
          company:company_id(id, name)
        `)
        .order('truck_number');
      
      if (error) throw error;
      
      const now = new Date();
      const twoMonthsFromNow = new Date(now.getTime() + TWO_MONTHS_MS);
      
      return data?.filter(truck => {
        const dotDate = truck.dot_inspection_date ? new Date(truck.dot_inspection_date) : null;
        const plateDate = truck.plate_expiration_date ? new Date(truck.plate_expiration_date) : null;
        const insuranceDate = truck.insurance_expiration_date ? new Date(truck.insurance_expiration_date) : null;
        
        // Include truck if it has any maintenance date set (oil change, tires swap, maintenance check)
        const hasMaintenanceDate = truck.oil_change_date || truck.tires_swap_date || truck.maintenance_check_date;
        
        return (
          hasMaintenanceDate ||
          (dotDate && dotDate <= twoMonthsFromNow) ||
          (plateDate && plateDate <= twoMonthsFromNow) ||
          (insuranceDate && insuranceDate <= twoMonthsFromNow)
        );
      }) || [];
    },
  });
};

export const useExpiringTrailers = () => {
  return useQuery({
    queryKey: ['expiring-trailers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trailers')
        .select('*')
        .order('trailer_number');
      
      if (error) throw error;
      
      const now = new Date();
      const twoMonthsFromNow = new Date(now.getTime() + TWO_MONTHS_MS);
      
      return data?.filter(trailer => {
        const dotDate = trailer.dot_inspection_date ? new Date(trailer.dot_inspection_date) : null;
        const plateDate = trailer.plate_expiration_date ? new Date(trailer.plate_expiration_date) : null;
        const insuranceDate = trailer.insurance_expiration_date ? new Date(trailer.insurance_expiration_date) : null;
        
        return (
          (dotDate && dotDate <= twoMonthsFromNow) ||
          (plateDate && plateDate <= twoMonthsFromNow) ||
          (insuranceDate && insuranceDate <= twoMonthsFromNow)
        );
      }) || [];
    },
  });
};

export const useExpiringDrivers = () => {
  return useQuery({
    queryKey: ['expiring-drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      const now = new Date();
      const twoMonthsFromNow = new Date(now.getTime() + TWO_MONTHS_MS);
      
      return data?.filter(driver => {
        const cdlDate = driver.cdl_expiration_date ? new Date(driver.cdl_expiration_date) : null;
        const mvrDate = driver.mvr_date ? new Date(driver.mvr_date) : null;
        const clearingHouseDate = driver.clearing_house ? new Date(driver.clearing_house) : null;
        const medicalCardDate = driver.medical_card_expiration_date ? new Date(driver.medical_card_expiration_date) : null;
        const randomDrugTestDate = driver.random_drug_test_date ? new Date(driver.random_drug_test_date) : null;
        
        return (
          (cdlDate && cdlDate <= twoMonthsFromNow) ||
          (mvrDate && mvrDate <= twoMonthsFromNow) ||
          (clearingHouseDate && clearingHouseDate <= twoMonthsFromNow) ||
          (medicalCardDate && medicalCardDate <= twoMonthsFromNow) ||
          (randomDrugTestDate && randomDrugTestDate <= twoMonthsFromNow)
        );
      }) || [];
    },
  });
};
