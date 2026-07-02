import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Users, Trash2, RefreshCw, Edit, LogOut, Search, Microscope } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { createUserSchema } from "@/lib/validation";

type OfficeLocation = 'Čačak' | 'KRAGUJEVAC' | 'BG 1st floor' | 'BG 4th floor' | 'Recovery' | null;

interface User {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone_number: string | null;
  office: OfficeLocation;
  ext: string | null;
  roles: ('dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting' | 'claims')[];
  created_at: string;
  daily_report_can_view: boolean;
  daily_report_can_edit: boolean;
  gross_percent: number | null;
  cut_percent: number | null;
}

const AdminUsers = () => {
  const { hasRole, profile } = useAuthContext();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<'dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting' | 'claims'>('dispatch');
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editOffice, setEditOffice] = useState<OfficeLocation>(null);
  const [editExt, setEditExt] = useState('');
  const [editDailyView, setEditDailyView] = useState(false);
  const [editDailyEdit, setEditDailyEdit] = useState(false);
  const [editGrossPercent, setEditGrossPercent] = useState<string>('');
  const [editCutPercent, setEditCutPercent] = useState<string>('');
  const [isUpdatingRoles, setIsUpdatingRoles] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
  const [showLogoutAllDialog, setShowLogoutAllDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [isHosInspectOpen, setIsHosInspectOpen] = useState(false);
  const [hosInspectLoading, setHosInspectLoading] = useState(false);
  const [hosInspectData, setHosInspectData] = useState<any>(null);
  const [isSamsaraInspectOpen, setIsSamsaraInspectOpen] = useState(false);
  const [samsaraInspectLoading, setSamsaraInspectLoading] = useState(false);
  const [samsaraInspectData, setSamsaraInspectData] = useState<any>(null);
  const [samsaraTruckFilter, setSamsaraTruckFilter] = useState('');
  
  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<'dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting' | 'claims'>('dispatch');
  const [office, setOffice] = useState<OfficeLocation>(null);
  const [ext, setExt] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [grossPercent, setGrossPercent] = useState<string>('1');
  const [cutPercent, setCutPercent] = useState<string>('5');
  const [formErrors, setFormErrors] = useState<{ email?: string; password?: string; fullName?: string; role?: string }>({});

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = !searchQuery || 
        (user.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || user.roles.includes(roleFilter as any);
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  // Security check: Only admins and accounting should access this page
  useEffect(() => {
    if (!loading && profile && !hasRole('admin') && !hasRole('accounting')) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to manage users",
        variant: "destructive",
      });
    }
  }, [profile, loading, hasRole, toast]);

  useEffect(() => {
    if (hasRole('admin') || hasRole('accounting')) {
      fetchUsers();
    }
  }, [hasRole]);

  // Realtime: refresh user list when profiles or user_roles change
  useEffect(() => {
    if (!(hasRole('admin') || hasRole('accounting'))) return;

    let scheduled = false;
    const scheduleRefresh = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        fetchUsers();
      }, 500);
    };

    const channel = supabase
      .channel('admin-users-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, scheduleRefresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasRole]);

  const fetchUsers = async () => {
    try {
      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles for all users
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Fetch Daily Report permissions
      const { data: permsData } = await supabase
        .from('daily_report_permissions' as any)
        .select('user_id, can_view, can_edit');
      const permsMap = new Map<string, { can_view: boolean; can_edit: boolean }>();
      ((permsData as any[]) || []).forEach((p) => permsMap.set(p.user_id, { can_view: !!p.can_view, can_edit: !!p.can_edit }));

      const usersWithRoles = (profilesData || []).map(profile => {
        const userRoles = (rolesData || [])
          .filter(r => r.user_id === profile.user_id)
          .map(r => r.role as 'dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'yard');
        const perm = permsMap.get(profile.user_id);
        const isAdmin = userRoles.includes('admin' as any);
        return {
          ...profile,
          office: profile.office as OfficeLocation,
          ext: profile.ext as string | null,
          phone_number: (profile as any).phone_number as string | null,
          roles: userRoles,
          daily_report_can_view: isAdmin ? true : !!perm?.can_view,
          daily_report_can_edit: isAdmin ? true : !!perm?.can_edit,
          gross_percent: (profile as any).gross_percent ?? null,
          cut_percent: (profile as any).cut_percent ?? null,
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    
    // Validate input
    const result = createUserSchema.safeParse({ email, password, fullName, role });
    
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string; fullName?: string; role?: string } = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        fieldErrors[field as keyof typeof fieldErrors] = err.message;
      });
      setFormErrors(fieldErrors);
      toast({
        title: "Validation Error",
        description: "Please correct the errors in the form",
        variant: "destructive",
      });
      return;
    }
    
    setIsCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Use admin-only edge function to create user
      const response = await fetch(
        'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/create-user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ 
            email, 
            password, 
            fullName: fullName || email, 
            role,
            office: office || null,
            ext: ext || null,
            phoneNumber: phoneNumber ? `+1 ${phoneNumber.replace(/^\+1\s?/, '')}` : null,
            grossPercent: role === 'dispatch' ? (grossPercent === '' ? null : Number(grossPercent)) : null,
            cutPercent: role === 'dispatch' ? (cutPercent === '' ? null : Number(cutPercent)) : null
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error creating user:', errorText);
        throw new Error('Failed to create user');
      }

      const data = await response.json();
      
      // Check if the function returned an error in the response
      if (data?.error) {
        throw new Error(data.error);
      }
      
      // Reset form
      setEmail("");
      setPassword("");
      setFullName("");
      setRole('dispatch');
      setOffice(null);
      setExt("");
      setPhoneNumber("");
      setGrossPercent('1');
      setCutPercent('5');
      setFormErrors({});
      setIsDialogOpen(false);
      
      // Refresh users list
      await fetchUsers();
      
      toast({
        title: "Success",
        description: "User created successfully!",
      });
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    setIsDeleting(userToDelete.user_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(
        'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/delete-user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ userId: userToDelete.user_id })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error deleting user:', errorText);
        throw new Error('Failed to delete user');
      }

      const data = await response.json();
      
      // Check if the function returned an error in the response
      if (data?.error) {
        throw new Error(data.error);
      }
      
      await fetchUsers();
      
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(null);
      setUserToDelete(null);
    }
  };

  const openEditDialog = (user: User) => {
    setUserToEdit(user);
    setEditRole(user.roles[0] || 'dispatch');
    setEditFullName(user.full_name || '');
    setEditPhoneNumber(user.phone_number || '');
    setEditOffice(user.office);
    setEditExt(user.ext || '');
    setEditDailyView(user.daily_report_can_view);
    setEditDailyEdit(user.daily_report_can_edit);
    setEditGrossPercent(user.gross_percent != null ? String(user.gross_percent) : (user.roles.includes('dispatch') ? '1' : ''));
    setEditCutPercent(user.cut_percent != null ? String(user.cut_percent) : (user.roles.includes('dispatch') ? '5' : ''));
    setIsEditDialogOpen(true);
  };

  const handleUpdateRoles = async () => {
    if (!userToEdit) return;

    setIsUpdatingRoles(true);
    try {
      // Update role, full name, office, and ext via edge function
      const { data, error } = await supabase.functions.invoke('update-user-role', {
        body: { 
          userId: userToEdit.user_id,
          role: editRole,
          fullName: editFullName,
          office: editOffice,
          ext: editExt || null,
          phoneNumber: editPhoneNumber ? `+1 ${editPhoneNumber.replace(/^\+1\s?/, '')}` : null,
          grossPercent: editRole === 'dispatch' ? (editGrossPercent === '' ? null : Number(editGrossPercent)) : null,
          cutPercent: editRole === 'dispatch' ? (editCutPercent === '' ? null : Number(editCutPercent)) : null
        }
      });

      if (error) {
        console.error('Error updating role:', error);
        throw new Error(error.message || 'Failed to update role');
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }

      // Persist Daily Report permissions (skip for admins — they always have access)
      const isAdminUser = userToEdit.roles.includes('admin');
      if (!isAdminUser) {
        const view = editDailyView || editDailyEdit; // edit implies view
        const { error: permError } = await (supabase as any)
          .from('daily_report_permissions')
          .upsert(
            {
              user_id: userToEdit.user_id,
              can_view: view,
              can_edit: editDailyEdit,
              updated_by: profile?.user_id ?? null,
            },
            { onConflict: 'user_id' }
          );
        if (permError) {
          console.error('Error updating Daily Report permissions:', permError);
          throw new Error(permError.message || 'Failed to save Daily Report permissions');
        }
      }

      await fetchUsers();
      setIsEditDialogOpen(false);
      setUserToEdit(null);
      
      toast({
        title: "Success",
        description: "User updated successfully",
      });
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingRoles(false);
    }
  };

  const handleLogoutAllUsers = async () => {
    setIsLoggingOutAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(
        'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/logout-all-users',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({})
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error logging out all users:', errorText);
        throw new Error('Failed to logout all users');
      }

      const data = await response.json();
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      setShowLogoutAllDialog(false);
      
      toast({
        title: "Success",
        description: data?.message || "All users have been logged out. Page will reload in 2 seconds.",
      });

      // Reload page after 2 seconds to force all clients to re-validate sessions
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error('Error logging out all users:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to log out all users",
        variant: "destructive",
      });
    } finally {
      setIsLoggingOutAll(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'manager':
        return 'default';
      case 'supervisor':
        return 'default';
      case 'safety':
        return 'default';
      case 'maintenance':
        return 'default';
      case 'chicago_management':
        return 'default';
      case 'yard':
        return 'default';
      case 'recruiting':
        return 'default';
      case 'dispatch':
        return 'secondary';
      case 'afterhours':
        return 'secondary';
      case 'driver':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Additional security check - only render for admins and accounting
  if (!hasRole('admin') && !hasRole('accounting')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-destructive mb-2">Access Denied</h2>
          <p className="text-muted-foreground">Admin or Accounting role required to manage users</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-8 w-8" />
            User Management
          </h1>
          <p className="text-muted-foreground">
            Manage system users and their roles
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={async () => {
              setIsHosInspectOpen(true);
              setHosInspectLoading(true);
              setHosInspectData(null);
              try {
                const { data, error } = await supabase.functions.invoke('hos-api-inspect');
                if (error) throw error;
                setHosInspectData(data);
              } catch (err: any) {
                toast({ title: "Error", description: err.message || "Failed to inspect HOS API", variant: "destructive" });
              } finally {
                setHosInspectLoading(false);
              }
            }}
          >
            <Microscope className="mr-2 h-4 w-4" />
            Inspect HOS API
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              setIsSamsaraInspectOpen(true);
              setSamsaraInspectLoading(true);
              setSamsaraInspectData(null);
              try {
                const { data, error } = await supabase.functions.invoke('samsara-inspect');
                if (error) throw error;
                setSamsaraInspectData(data);
              } catch (err: any) {
                toast({ title: "Error", description: err.message || "Failed to inspect Samsara", variant: "destructive" });
              } finally {
                setSamsaraInspectLoading(false);
              }
            }}
          >
            <Microscope className="mr-2 h-4 w-4" />
            Inspect Samsara
          </Button>
          <Button variant="outline" onClick={fetchUsers}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button 
            variant="destructive" 
            onClick={() => setShowLogoutAllDialog(true)}
            disabled={isLoggingOutAll}
          >
            {isLoggingOutAll ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Logging out...
              </>
            ) : (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                Log Off All Users
              </>
            )}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-full-name">Full Name</Label>
                <Input
                  id="new-full-name"
                  placeholder="Enter full name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setFormErrors(prev => ({ ...prev, fullName: undefined }));
                  }}
                />
                {formErrors.fullName && (
                  <p className="text-sm text-destructive">{formErrors.fullName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="Enter email address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  required
                />
                {formErrors.email && (
                  <p className="text-sm text-destructive">{formErrors.email}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Min 10 chars with uppercase, lowercase, number"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormErrors(prev => ({ ...prev, password: undefined }));
                  }}
                  required
                />
                {formErrors.password && (
                  <p className="text-sm text-destructive">{formErrors.password}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-role">Role</Label>
                <Select value={role} onValueChange={(value: 'dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting' | 'claims') => {
                  setRole(value);
                  setFormErrors(prev => ({ ...prev, role: undefined }));
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dispatch">Dispatch</SelectItem>
                    <SelectItem value="afterhours">After Hours</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="safety">Safety</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="accounting">Accounting</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="chicago_management">Chicago Management</SelectItem>
                    <SelectItem value="yard">Yard</SelectItem>
                    <SelectItem value="recruiting">Recruiting</SelectItem>
                    <SelectItem value="claims">Claims</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.role && (
                  <p className="text-sm text-destructive">{formErrors.role}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-office">Office (Optional)</Label>
                <Select value={office || "none"} onValueChange={(value) => setOffice(value === "none" ? null : value as OfficeLocation)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select office" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Office</SelectItem>
                    <SelectItem value="Čačak">ČAČAK</SelectItem>
                    <SelectItem value="KRAGUJEVAC">Kragujevac</SelectItem>
                    <SelectItem value="BG 1st floor">BG 1st floor</SelectItem>
                    <SelectItem value="BG 4th floor">BG 4th floor</SelectItem>
                    <SelectItem value="Recovery">Recovery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-phone">Phone Number (Optional)</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">+1</span>
                  <Input
                    id="new-phone"
                    className="rounded-l-none"
                    placeholder="234 567 8900"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s()-]/g, ''))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-ext">Extension (Optional)</Label>
                <Input
                  id="new-ext"
                  placeholder="e.g. 101"
                  value={ext}
                  onChange={(e) => setExt(e.target.value)}
                />
              </div>
              {role === 'dispatch' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-gross-pct">Gross %</Label>
                    <Input
                      id="new-gross-pct"
                      type="number"
                      step="0.01"
                      value={grossPercent}
                      onChange={(e) => setGrossPercent(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-cut-pct">Cut %</Label>
                    <Input
                      id="new-cut-pct"
                      type="number"
                      step="0.01"
                      value={cutPercent}
                      onChange={(e) => setCutPercent(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Create User
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>System Users</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-[250px] h-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="dispatch">Dispatch</SelectItem>
                <SelectItem value="afterhours">After Hours</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="accounting">Accounting</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="chicago_management">Chicago Mgmt</SelectItem>
                <SelectItem value="yard">Yard</SelectItem>
                <SelectItem value="recruiting">Recruiting</SelectItem>
                    <SelectItem value="claims">Claims</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Ext</TableHead>
                <TableHead>Office</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Daily Report</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.full_name || 'N/A'}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.phone_number || '-'}</TableCell>
                  <TableCell>{user.ext || '-'}</TableCell>
                  <TableCell>{user.office || '-'}</TableCell>
                  <TableCell>
                    {user.roles.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {user.roles.map(role => (
                          <Badge key={role} variant={getRoleBadgeVariant(role)}>
                            {role.charAt(0).toUpperCase() + role.slice(1)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Badge variant="outline">No role</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {user.daily_report_can_edit ? (
                        <Badge variant="default">Edit</Badge>
                      ) : user.daily_report_can_view ? (
                        <Badge variant="secondary">View</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">None</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                        title="Edit roles"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setUserToDelete(user)}
                        disabled={isDeleting === user.user_id}
                        title="Delete user"
                      >
                        {isDeleting === user.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {users.length === 0 ? "No users found" : "No users match the current filters"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-full-name">Full Name</Label>
              <Input
                id="edit-full-name"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                placeholder="Enter full name"
              />
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Email: <span className="font-medium text-foreground">{userToEdit?.email}</span>
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={editRole} onValueChange={(value: 'dispatch' | 'afterhours' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting' | 'maintenance' | 'chicago_management' | 'yard' | 'recruiting' | 'claims') => setEditRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dispatch">Dispatch</SelectItem>
                  <SelectItem value="afterhours">After Hours</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="accounting">Accounting</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="chicago_management">Chicago Management</SelectItem>
                  <SelectItem value="yard">Yard</SelectItem>
                  <SelectItem value="recruiting">Recruiting</SelectItem>
                    <SelectItem value="claims">Claims</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-office">Office</Label>
              <Select value={editOffice || "none"} onValueChange={(value) => setEditOffice(value === "none" ? null : value as OfficeLocation)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select office" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Office</SelectItem>
                  <SelectItem value="Čačak">Čačak</SelectItem>
                  <SelectItem value="KRAGUJEVAC">Kragujevac</SelectItem>
                  <SelectItem value="BG 1st floor">BG 1st floor</SelectItem>
                  <SelectItem value="BG 4th floor">BG 4th floor</SelectItem>
                  <SelectItem value="Recovery">Recovery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone Number</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">+1</span>
                <Input
                  id="edit-phone"
                  className="rounded-l-none"
                  value={editPhoneNumber.replace(/^\+1\s?/, '')}
                  onChange={(e) => setEditPhoneNumber(e.target.value.replace(/[^\d\s()-]/g, ''))}
                  placeholder="234 567 8900"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-ext">Extension</Label>
              <Input
                id="edit-ext"
                value={editExt}
                onChange={(e) => setEditExt(e.target.value)}
                placeholder="e.g. 101"
              />
            </div>

            {editRole === 'dispatch' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-gross-pct">Gross %</Label>
                  <Input
                    id="edit-gross-pct"
                    type="number"
                    step="0.01"
                    value={editGrossPercent}
                    onChange={(e) => setEditGrossPercent(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-cut-pct">Cut %</Label>
                  <Input
                    id="edit-cut-pct"
                    type="number"
                    step="0.01"
                    value={editCutPercent}
                    onChange={(e) => setEditCutPercent(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Beverly Daily Report</p>
                <p className="text-xs text-muted-foreground">
                  {userToEdit?.roles.includes('admin')
                    ? "Admins always have full access to the Daily Report."
                    : "Control whether this user can see the Daily Report page (and the add-row button in Reports) and whether they can edit entries."}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-daily-view" className="text-sm cursor-pointer">
                  Can view Daily Report
                </Label>
                <Switch
                  id="edit-daily-view"
                  checked={editDailyView || editDailyEdit}
                  onCheckedChange={(checked) => {
                    setEditDailyView(checked);
                    if (!checked) setEditDailyEdit(false);
                  }}
                  disabled={userToEdit?.roles.includes('admin')}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-daily-edit" className="text-sm cursor-pointer">
                  Can edit Daily Report
                </Label>
                <Switch
                  id="edit-daily-edit"
                  checked={editDailyEdit}
                  onCheckedChange={(checked) => {
                    setEditDailyEdit(checked);
                    if (checked) setEditDailyView(true);
                  }}
                  disabled={userToEdit?.roles.includes('admin')}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setUserToEdit(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateRoles}
                disabled={isUpdatingRoles}
              >
                {isUpdatingRoles ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update User'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {userToDelete?.full_name || userToDelete?.email}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLogoutAllDialog} onOpenChange={setShowLogoutAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log Off All Users</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately log out all users from all devices. They will need to sign in again to access the system. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutAllUsers}>Log Off All Users</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isHosInspectOpen} onOpenChange={setIsHosInspectOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>🔍 HOS API Raw Data Inspector</DialogTitle>
          </DialogHeader>
          {hosInspectLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mr-2" />
              <span>Fetching from Transit Tracking API...</span>
            </div>
          ) : hosInspectData?.keys ? (
            <ScrollArea className="flex-1 overflow-auto">
              <div className="space-y-6 pr-4">
                {hosInspectData.keys.map((keyData: any) => (
                  <div key={keyData.keyIndex} className="space-y-3">
                    <h3 className="font-semibold text-lg">
                      API Key #{keyData.keyIndex + 1} — {keyData.recordCount} records
                    </h3>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">All Fields ({keyData.fieldNames?.length || 0}):</h4>
                      <div className="flex flex-wrap gap-1">
                        {(keyData.fieldNames || []).map((f: string) => (
                          <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">Sample Records:</h4>
                      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-96">
                        {JSON.stringify(keyData.samples, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-muted-foreground">No data returned.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isSamsaraInspectOpen} onOpenChange={setIsSamsaraInspectOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>🛰️ Samsara Raw Data Inspector</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 pb-2">
            <Input
              placeholder="Filter by truck number (e.g. 7461)"
              value={samsaraTruckFilter}
              onChange={(e) => setSamsaraTruckFilter(e.target.value)}
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={async () => {
                setSamsaraInspectLoading(true);
                setSamsaraInspectData(null);
                try {
                  const truck = samsaraTruckFilter.trim();
                  const { data, error } = await supabase.functions.invoke('samsara-inspect', {
                    body: truck ? { truck } : {},
                  });
                  if (error) throw error;
                  setSamsaraInspectData(data);
                } catch (err: any) {
                  toast({ title: "Error", description: err.message || "Failed to inspect Samsara", variant: "destructive" });
                } finally {
                  setSamsaraInspectLoading(false);
                }
              }}
              disabled={samsaraInspectLoading}
            >
              {samsaraInspectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          {samsaraInspectLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mr-2" />
              <span>Fetching from all Samsara keys...</span>
            </div>
          ) : samsaraInspectData?.keys ? (
            <ScrollArea className="flex-1 overflow-auto">
              <div className="space-y-6 pr-4">
                {samsaraInspectData.keys.map((k: any) => (
                  <div key={k.keyIndex} className="space-y-2 border rounded-md p-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h3 className="font-semibold text-base">
                        {k.label} {k.configured ? '' : '(not configured)'}
                      </h3>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {k.configured && (
                          <>
                            <Badge variant="outline">total: {k.recordCount}</Badge>
                            <Badge variant="outline">shown: {k.matchCount}</Badge>
                            {k.error && <Badge variant="destructive">error: {k.error}</Badge>}
                          </>
                        )}
                      </div>
                    </div>
                    {k.configured && k.vehicles?.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground">
                            <tr className="text-left">
                              <th className="py-1 pr-2">Name</th>
                              <th className="py-1 pr-2">VIN</th>
                              <th className="py-1 pr-2">Lat, Lng</th>
                              <th className="py-1 pr-2">In bounds</th>
                              <th className="py-1 pr-2">Age (min)</th>
                              <th className="py-1 pr-2">Time</th>
                              <th className="py-1 pr-2">Reverse geo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {k.vehicles.map((v: any) => (
                              <tr key={v.id} className="border-t align-top">
                                <td className="py-1 pr-2 font-medium">{v.name || '—'}</td>
                                <td className="py-1 pr-2 font-mono">{v.vin || '—'}</td>
                                <td className="py-1 pr-2 font-mono">
                                  {v.location
                                    ? `${v.location.latitude?.toFixed?.(5) ?? v.location.latitude}, ${v.location.longitude?.toFixed?.(5) ?? v.location.longitude}`
                                    : '—'}
                                </td>
                                <td className="py-1 pr-2">
                                  {v.location ? (
                                    <Badge variant={v.location.inBounds ? 'default' : 'destructive'}>
                                      {v.location.inBounds ? 'OK' : 'OUT'}
                                    </Badge>
                                  ) : '—'}
                                </td>
                                <td className="py-1 pr-2">{v.location?.ageMinutes ?? '—'}</td>
                                <td className="py-1 pr-2">{v.location?.time || '—'}</td>
                                <td className="py-1 pr-2 text-muted-foreground">
                                  {v.location?.reverseGeo?.formattedLocation || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : k.configured ? (
                      <p className="text-xs text-muted-foreground">
                        {samsaraInspectData.truckFilter
                          ? 'No matches on this key.'
                          : 'No vehicles returned.'}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-muted-foreground">No data returned.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;