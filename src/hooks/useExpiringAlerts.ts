import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000; // 60 days in milliseconds

export const useExpiringTrucks = () => {
  return useQuery({
    queryKey: ['expiring-trucks'],
    queryFn: async () => {
      // Stage 1: Flat trucks fetch
      const { data: trucks, error } = await supabase
        .from('trucks')
        .select('*')
        .eq('is_active', true)
        .order('truck_number');
      
      if (error) throw error;
      
      const now = new Date();
      const twoMonthsFromNow = new Date(now.getTime() + TWO_MONTHS_MS);
      
      const filteredTrucks = trucks?.filter(truck => {
        const dotDate = truck.dot_inspection_date ? new Date(truck.dot_inspection_date) : null;
        const plateDate = truck.plate_expiration_date ? new Date(truck.plate_expiration_date) : null;
        const insuranceDate = truck.insurance_expiration_date ? new Date(truck.insurance_expiration_date) : null;
        const hasMaintenanceDate = truck.oil_change_date || truck.tires_swap_date || truck.maintenance_check_date;
        
        return (
          hasMaintenanceDate ||
          (dotDate && dotDate <= twoMonthsFromNow) ||
          (plateDate && plateDate <= twoMonthsFromNow) ||
          (insuranceDate && insuranceDate <= twoMonthsFromNow)
        );
      }) || [];

      if (filteredTrucks.length === 0) return [];

      // Stage 2: Batch fetch drivers and companies for filtered trucks only
      const driverIds = [...new Set(filteredTrucks.flatMap(t => [t.driver1_id, t.driver2_id].filter(Boolean)))] as string[];
      const companyIds = [...new Set(filteredTrucks.map(t => t.company_id).filter(Boolean))] as string[];

      const [driversRes, companiesRes] = await Promise.all([
        driverIds.length > 0
          ? supabase.from('drivers').select('id, name, company_id').in('id', driverIds)
          : { data: [] },
        companyIds.length > 0
          ? supabase.from('companies').select('id, name').in('id', companyIds)
          : { data: [] },
      ]);

      // Also fetch driver companies
      const driverCompanyIds = [...new Set((driversRes.data || []).map(d => d.company_id).filter(Boolean))] as string[];
      const driverCompaniesRes = driverCompanyIds.length > 0
        ? await supabase.from('companies').select('id, name').in('id', driverCompanyIds)
        : { data: [] };

      const driverMap = new Map((driversRes.data || []).map(d => [d.id, d]));
      const companyMap = new Map([...(companiesRes.data || []), ...(driverCompaniesRes.data || [])].map(c => [c.id, c]));

      // Stage 3: Assemble (match original joined shape)
      return filteredTrucks.map(truck => {
        const driver1 = driverMap.get(truck.driver1_id);
        const driver2 = driverMap.get(truck.driver2_id);
        return {
          ...truck,
          driver1: driver1 ? { ...driver1, company: companyMap.get(driver1.company_id) || null } : null,
          driver2: driver2 || null,
          company: companyMap.get(truck.company_id) || null,
        };
      });
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
        .eq('is_active', true)
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
        .eq('is_active', true)
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
