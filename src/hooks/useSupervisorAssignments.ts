import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SupervisorAssignment {
  id: string;
  dispatcher_id: string;
  supervisor_id: string;
  assigned_at: string;
  dispatcher_name: string;
  dispatcher_email: string;
  dispatcher_ext?: string;
}

interface Supervisor {
  id: string;
  full_name: string;
  email: string;
  ext?: string;
  assignments: SupervisorAssignment[];
}

export const useSupervisorAssignments = (allDispatchers: any[]) => {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [assignments, setAssignments] = useState<SupervisorAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAssignments = async () => {
    try {
      setLoading(true);

      // Fetch all supervisor assignments
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('dispatcher_supervisors')
        .select('*')
        .order('assigned_at', { ascending: false });

      if (assignmentError) throw assignmentError;

      // Map assignments with dispatcher names
      const mappedAssignments: SupervisorAssignment[] = (assignmentData || []).map(a => {
        const dispatcher = allDispatchers.find(d => d.id === a.dispatcher_id);
        return {
          id: a.id,
          dispatcher_id: a.dispatcher_id,
          supervisor_id: a.supervisor_id,
          assigned_at: a.assigned_at,
          dispatcher_name: dispatcher?.full_name || dispatcher?.email || 'Unknown',
          dispatcher_email: dispatcher?.email || '',
          dispatcher_ext: dispatcher?.ext,
        };
      });

      setAssignments(mappedAssignments);

      // Get supervisors from dispatchers who have 'supervisor' role
      const supervisorUsers = allDispatchers.filter(d => d.roles?.includes('supervisor'));
      
      // Build supervisor list with their assignments
      const supervisorList: Supervisor[] = supervisorUsers.map(sup => ({
        id: sup.id,
        full_name: sup.full_name,
        email: sup.email,
        ext: sup.ext,
        assignments: mappedAssignments.filter(a => a.supervisor_id === sup.id),
      }));

      setSupervisors(supervisorList);
    } catch (error: any) {
      console.error('Error fetching supervisor assignments:', error);
      toast({
        title: "Error",
        description: "Failed to fetch supervisor assignments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allDispatchers.length > 0) {
      fetchAssignments();
    }
  }, [allDispatchers]);

  const assignDispatcherToSupervisor = async (dispatcherId: string, supervisorId: string) => {
    try {
      const { error } = await supabase
        .from('dispatcher_supervisors')
        .upsert({
          dispatcher_id: dispatcherId,
          supervisor_id: supervisorId,
          assigned_at: new Date().toISOString(),
        }, {
          onConflict: 'dispatcher_id'
        });

      if (error) throw error;

      const supervisor = allDispatchers.find(d => d.id === supervisorId);
      const dispatcher = allDispatchers.find(d => d.id === dispatcherId);
      
      toast({
        title: "Success",
        description: `${dispatcher?.full_name || dispatcher?.email} assigned to ${supervisor?.full_name || supervisor?.email}`,
      });

      fetchAssignments();
    } catch (error: any) {
      console.error('Error assigning dispatcher to supervisor:', error);
      toast({
        title: "Error",
        description: "Failed to assign dispatcher to supervisor",
        variant: "destructive",
      });
    }
  };

  const removeDispatcherFromSupervisor = async (dispatcherId: string) => {
    try {
      const { error } = await supabase
        .from('dispatcher_supervisors')
        .delete()
        .eq('dispatcher_id', dispatcherId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Dispatcher removed from supervisor",
      });

      fetchAssignments();
    } catch (error: any) {
      console.error('Error removing dispatcher from supervisor:', error);
      toast({
        title: "Error",
        description: "Failed to remove dispatcher from supervisor",
        variant: "destructive",
      });
    }
  };

  // Get dispatchers that are not assigned to any supervisor
  const getUnassignedDispatchers = () => {
    const assignedIds = new Set(assignments.map(a => a.dispatcher_id));
    return allDispatchers.filter(d => 
      d.roles?.includes('dispatch') && !assignedIds.has(d.id)
    );
  };

  return {
    supervisors,
    assignments,
    loading,
    assignDispatcherToSupervisor,
    removeDispatcherFromSupervisor,
    getUnassignedDispatchers,
    refetch: fetchAssignments,
  };
};
