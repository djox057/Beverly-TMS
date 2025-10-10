import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Users, Trash2, RefreshCw, Edit } from "lucide-react";
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

interface User {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  roles: ('dispatch' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting')[];
  created_at: string;
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
  const [editRoles, setEditRoles] = useState<('dispatch' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting')[]>([]);
  const [editFullName, setEditFullName] = useState('');
  const [isUpdatingRoles, setIsUpdatingRoles] = useState(false);
  
  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<'dispatch' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting'>('dispatch');
  const [formErrors, setFormErrors] = useState<{ email?: string; password?: string; fullName?: string; role?: string }>({});

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

      const usersWithRoles = (profilesData || []).map(profile => {
        const userRoles = (rolesData || [])
          .filter(r => r.user_id === profile.user_id)
          .map(r => r.role as 'dispatch' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting');
        
        return {
          ...profile,
          roles: userRoles
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
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { 
          email, 
          password, 
          fullName: fullName || email, 
          role 
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      
      if (error) throw error;
      
      // Check if the function returned an error in the response
      if (data?.error) {
        throw new Error(data.error);
      }
      
      // Reset form
      setEmail("");
      setPassword("");
      setFullName("");
      setRole('dispatch');
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

      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: userToDelete.user_id },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      
      if (error) throw error;
      
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
    setEditRoles(user.roles);
    setEditFullName(user.full_name || '');
    setIsEditDialogOpen(true);
  };

  const handleUpdateRoles = async () => {
    if (!userToEdit) return;

    setIsUpdatingRoles(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Update roles via edge function with explicit auth header
      const { data, error } = await supabase.functions.invoke('update-user-role', {
        body: { 
          userId: userToEdit.user_id,
          roles: editRoles
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      
      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.error);
      }

      // Update full name if changed
      if (editFullName !== userToEdit.full_name) {
        const { error: nameError } = await supabase
          .from('profiles')
          .update({ full_name: editFullName })
          .eq('user_id', userToEdit.user_id);

        if (nameError) throw nameError;
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

  const toggleRole = (role: 'dispatch' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting') => {
    setEditRoles(prev => {
      if (prev.includes(role)) {
        return prev.filter(r => r !== role);
      } else {
        return [...prev, role];
      }
    });
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
      case 'dispatch':
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
          <Button variant="outline" onClick={fetchUsers}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
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
                <Select value={role} onValueChange={(value: 'dispatch' | 'admin' | 'manager' | 'driver' | 'safety' | 'supervisor' | 'accounting') => {
                  setRole(value);
                  setFormErrors(prev => ({ ...prev, role: undefined }));
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dispatch">Dispatch</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="safety">Safety</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="accounting">Accounting</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.role && (
                  <p className="text-sm text-destructive">{formErrors.role}</p>
                )}
              </div>
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
        <CardHeader>
          <CardTitle>System Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.full_name || 'N/A'}</TableCell>
                  <TableCell>{user.email}</TableCell>
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
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No users found
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
              <Label>Roles (select all that apply)</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['dispatch', 'manager', 'supervisor', 'safety', 'admin', 'accounting', 'driver'] as const).map(role => (
                  <label
                    key={role}
                    className="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={editRoles.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium capitalize">{role}</span>
                  </label>
                ))}
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
                disabled={isUpdatingRoles || editRoles.length === 0}
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
    </div>
  );
};

export default AdminUsers;