import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  getDocs,
  setDoc,
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { Program, CATEGORIES, UserProfile, Role, Invitation } from './types';
import { 
  LayoutGrid,
  List,
  Plus, 
  Search, 
  Download, 
  Edit2, 
  Trash2, 
  ExternalLink, 
  Calendar, 
  MapPin, 
  DollarSign, 
  Home, 
  Filter,
  LogOut,
  LogIn,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Shield,
  User as UserIcon,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setErrorDetails(event.error?.message || 'An unexpected error occurred');
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm max-w-md w-full border border-blue-200">
          <h2 className="text-2xl font-semibold text-blue-900 mb-4">Something went wrong</h2>
          <p className="text-blue-600 mb-6 font-sans">{errorDetails}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-blue-900 text-white py-3 rounded-xl font-medium hover:bg-blue-800 transition-colors shadow-sm"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSelectingRole, setIsSelectingRole] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [activeTab, setActiveTab] = useState<'programs' | 'users'>('programs');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const isAdmin = userProfile?.role === 'admin';

  // Reset active tab when role changes to counselor
  useEffect(() => {
    if (!isAdmin && activeTab === 'users') {
      setActiveTab('programs');
    }
  }, [isAdmin, activeTab]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            setUserProfile({ uid: u.uid, ...userDoc.data() } as UserProfile);
            setIsSelectingRole(false);
          } else {
            // Check for invitations
            const q = query(collection(db, 'invitations'), where('email', '==', u.email));
            const inviteSnap = await getDocs(q);
            
            if (!inviteSnap.empty) {
              const invite = inviteSnap.docs[0].data() as Invitation;
              const newProfile: UserProfile = {
                uid: u.uid,
                email: u.email || '',
                role: invite.role,
                displayName: u.displayName || '',
                photoURL: u.photoURL || '',
              };
              
              await setDoc(doc(db, 'users', u.uid), {
                email: newProfile.email,
                role: newProfile.role,
                displayName: newProfile.displayName,
                photoURL: newProfile.photoURL,
              });
              
              // Delete invitation after use
              await deleteDoc(doc(db, 'invitations', inviteSnap.docs[0].id));
              
              setUserProfile(newProfile);
              setIsSelectingRole(false);
            } else {
              setIsSelectingRole(true);
            }
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      } else {
        setUserProfile(null);
        setIsSelectingRole(false);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleSelectRole = async (role: Role) => {
    if (!user) return;
    
    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      role,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
    };

    try {
      await setDoc(doc(db, 'users', user.uid), {
        email: newProfile.email,
        role: newProfile.role,
        displayName: newProfile.displayName,
        photoURL: newProfile.photoURL,
      });
      setUserProfile(newProfile);
      setIsSelectingRole(false);
    } catch (error) {
      console.error('Error saving profile:', error);
    }
  };

  const handleSwitchRole = async () => {
    if (!user || !userProfile) return;
    const newRole: Role = userProfile.role === 'admin' ? 'counselor' : 'admin';
    
    try {
      await updateDoc(doc(db, 'users', user.uid), { role: newRole });
      setUserProfile({ ...userProfile, role: newRole });
    } catch (error) {
      console.error('Error switching role:', error);
    }
  };

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  // Data Listener
  useEffect(() => {
    if (!isAuthReady || !user || !userProfile) {
      setPrograms([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    // Shared data: everyone sees all programs
    const q = collection(db, 'programs');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Program[];
      setPrograms(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'programs');
    });

    return () => unsubscribe();
  }, [isAuthReady, user, userProfile]);

  // Users Listener (Admin only)
  useEffect(() => {
    if (!isAdmin) {
      setUsers([]);
      setInvitations([]);
      return;
    }

    const qUsers = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as UserProfile[];
      setUsers(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const qInvites = collection(db, 'invitations');
    const unsubscribeInvites = onSnapshot(qInvites, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invitation[];
      setInvitations(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invitations');
    });

    return () => {
      unsubscribeUsers();
      unsubscribeInvites();
    };
  }, [isAdmin]);

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inviteEmail) return;
    
    setIsInviting(true);
    try {
      await addDoc(collection(db, 'invitations'), {
        email: inviteEmail.toLowerCase().trim(),
        role: 'counselor',
        invitedBy: user.uid,
        createdAt: new Date().toISOString(),
      });
      setInviteEmail('');
      alert(`Invitation sent to ${inviteEmail}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invitations');
    } finally {
      setIsInviting(false);
    }
  };

  const handleDeleteInvitation = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'invitations', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invitations/${id}`);
    }
  };

  const handleUpdateUserRole = async (uid: string, newRole: Role) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this program?')) return;
    try {
      await deleteDoc(doc(db, 'programs', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `programs/${id}`);
    }
  };

  const handleExport = () => {
    if (programs.length === 0) return;
    
    const headers = ['Name', 'Institution', 'Location', 'Category', 'Deadline', 'Start Date', 'End Date', 'Cost', 'Residential', 'Eligibility', 'Website', 'Notes'];
    const csvContent = [
      headers.join(','),
      ...programs.map(p => [
        `"${p.name}"`,
        `"${p.institution}"`,
        `"${p.location || ''}"`,
        `"${p.category}"`,
        `"${p.deadline || ''}"`,
        `"${p.startDate || ''}"`,
        `"${p.endDate || ''}"`,
        p.cost || 0,
        p.isResidential ? 'Yes' : 'No',
        `"${p.eligibility || ''}"`,
        `"${p.website || ''}"`,
        `"${p.notes || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `pre_college_programs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredPrograms = programs.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.institution.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'All' || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-blue-50 text-blue-900 font-sans selection:bg-blue-200">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-blue-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-900 rounded flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-blue-900">ProgramManager</h1>
            </div>
            
            {user ? (
              <div className="flex items-center gap-4">
                <button 
                  onClick={handleSwitchRole}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 rounded text-[10px] font-bold uppercase tracking-widest text-blue-600 transition-colors"
                  title="Switch Role for Testing"
                >
                  <Shield className="w-3 h-3" />
                  Switch to {isAdmin ? 'Counselor' : 'Admin'}
                </button>
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-semibold">{user.displayName}</p>
                  <div className="flex items-center justify-end gap-1">
                    {isAdmin && <Shield className="w-3 h-3 text-emerald-600" />}
                    <p className="text-[10px] text-blue-500 uppercase font-bold tracking-wider">{userProfile?.role || 'Counselor'}</p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 hover:bg-blue-100 rounded transition-colors text-blue-500"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded font-medium hover:bg-blue-800 transition-all active:scale-95 shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {!user ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 bg-blue-100 rounded flex items-center justify-center mb-8">
                <FileText className="w-10 h-10 text-blue-300" />
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-blue-900 mb-4">Centralized Program Database</h2>
              <p className="text-blue-500 max-w-lg mb-10 text-lg leading-relaxed">
                A professional-grade system for independent college counselors to manage, track, and export pre-college program data.
              </p>
              <button 
                onClick={handleLogin}
                className="bg-blue-900 text-white px-10 py-4 rounded font-semibold text-lg hover:bg-blue-800 transition-all shadow-lg shadow-blue-200 active:scale-95"
              >
                Sign in to Dashboard
              </button>
            </div>
          ) : isSelectingRole ? (
            <div className="flex flex-col items-center justify-center py-20 text-center max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold tracking-tight text-blue-900 mb-2">Select Account Type</h2>
              <p className="text-blue-500 mb-12">Choose the role that best fits your workflow.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full">
                <button 
                  onClick={() => handleSelectRole('admin')}
                  className="group p-10 bg-white border border-blue-200 rounded hover:border-blue-900 hover:shadow-xl transition-all text-left"
                >
                  <div className="w-12 h-12 bg-emerald-50 rounded flex items-center justify-center mb-6 group-hover:bg-emerald-100 transition-colors">
                    <Shield className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-blue-900 mb-3">Administrator</h3>
                  <p className="text-sm text-blue-500 leading-relaxed">
                    Full system access. Manage the global database, curate programs, and oversee user permissions.
                  </p>
                </button>
 
                <button 
                  onClick={() => handleSelectRole('counselor')}
                  className="group p-10 bg-white border border-blue-200 rounded hover:border-blue-900 hover:shadow-xl transition-all text-left"
                >
                  <div className="w-12 h-12 bg-blue-50 rounded flex items-center justify-center mb-6 group-hover:bg-blue-100 transition-colors">
                    <UserIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-blue-900 mb-3">Counselor</h3>
                  <p className="text-sm text-blue-500 leading-relaxed">
                    Standard access. Browse the curated database, search for student needs, and export custom reports.
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Admin Tabs */}
              {isAdmin && (
                <div className="flex gap-10 mb-10 border-b border-blue-200">
                  <button 
                    onClick={() => setActiveTab('programs')}
                    className={cn(
                      "pb-4 px-1 text-xs font-bold uppercase tracking-widest transition-all relative",
                      activeTab === 'programs' ? "text-blue-900" : "text-blue-400 hover:text-blue-600"
                    )}
                  >
                    Programs Database
                    {activeTab === 'programs' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-900" />}
                  </button>
                  <button 
                    onClick={() => setActiveTab('users')}
                    className={cn(
                      "pb-4 px-1 text-xs font-bold uppercase tracking-widest transition-all relative",
                      activeTab === 'users' ? "text-blue-900" : "text-blue-400 hover:text-blue-600"
                    )}
                  >
                    User Management
                    {activeTab === 'users' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-900" />}
                  </button>
                </div>
              )}

              {activeTab === 'programs' || !isAdmin ? (
                <>
                  {/* Controls */}
                  <div className="flex flex-col md:flex-row gap-4 mb-10">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                      <input 
                        type="text"
                        placeholder="Search programs or institutions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-900 focus:border-blue-900 transition-all text-sm"
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="relative">
                        <select 
                          value={filterCategory}
                          onChange={(e) => setFilterCategory(e.target.value)}
                          className="appearance-none pl-10 pr-10 py-3 bg-white border border-blue-200 rounded focus:outline-none focus:border-blue-900 transition-all cursor-pointer text-sm font-medium"
                        >
                          <option value="All">All Categories</option>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                      </div>
                      <div className="flex bg-white border border-blue-200 rounded p-1">
                        <button 
                          onClick={() => setViewMode('card')}
                          className={cn(
                            "p-2 rounded transition-all",
                            viewMode === 'card' ? "bg-blue-900 text-white shadow-sm" : "text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                          )}
                          title="Card View"
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setViewMode('list')}
                          className={cn(
                            "p-2 rounded transition-all",
                            viewMode === 'list' ? "bg-blue-900 text-white shadow-sm" : "text-blue-400 hover:text-blue-600 hover:bg-blue-50"
                          )}
                          title="List View"
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </div>
                      <button 
                        onClick={handleExport}
                        disabled={programs.length === 0}
                        className="flex items-center gap-2 px-4 py-3 bg-white border border-blue-200 rounded hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Export CSV</span>
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={() => {
                            setEditingProgram(null);
                            setIsFormOpen(true);
                          }}
                          className="flex items-center gap-2 px-6 py-3 bg-blue-900 text-white rounded hover:bg-blue-800 transition-all shadow-sm active:scale-95 text-sm font-semibold"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Program</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-10">
                    {[
                      { label: 'Total Programs', value: programs.length },
                      { label: 'Upcoming Deadlines', value: programs.filter(p => p.deadline && new Date(p.deadline) > new Date()).length },
                      { label: 'Residential', value: programs.filter(p => p.isResidential).length },
                      { label: 'STEM Focus', value: programs.filter(p => p.category === 'STEM').length },
                    ].map((stat, i) => (
                      <div key={i} className="bg-white p-6 rounded border border-blue-200 shadow-sm">
                        <p className="text-[10px] text-blue-500 uppercase tracking-widest font-bold mb-2">{stat.label}</p>
                        <p className="text-3xl font-mono font-medium text-blue-900">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Program List */}
                  {isLoading ? (
                    <div className="flex justify-center py-20">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-300" />
                    </div>
                  ) : filteredPrograms.length > 0 ? (
                    viewMode === 'card' ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <AnimatePresence mode="popLayout">
                          {filteredPrograms.map((program) => (
                            <motion.div 
                              key={program.id}
                              layout
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="group bg-white rounded border border-blue-200 overflow-hidden hover:border-blue-400 hover:shadow-lg transition-all duration-200 flex flex-col"
                            >
                              <div className="p-6 flex-1">
                                <div className="flex justify-between items-start mb-6">
                                  <div>
                                    <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest rounded mb-3">
                                      {program.category}
                                    </span>
                                    <h3 className="text-xl font-bold text-blue-900 group-hover:text-blue-700 transition-colors">
                                      {program.name}
                                    </h3>
                                    <p className="text-blue-500 flex items-center gap-1.5 mt-1.5">
                                      <MapPin className="w-3.5 h-3.5" />
                                      <span className="text-sm font-medium">{program.institution} • {program.location || 'Remote'}</span>
                                    </p>
                                  </div>
                                  {isAdmin && (
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={() => {
                                          setEditingProgram(program);
                                          setIsFormOpen(true);
                                        }}
                                        className="p-2 hover:bg-blue-100 rounded text-blue-400 hover:text-blue-900 transition-colors"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={() => handleDelete(program.id)}
                                        className="p-2 hover:bg-red-50 rounded text-blue-400 hover:text-red-600 transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
 
                                <div className="grid grid-cols-2 gap-y-5 gap-x-6 mb-8">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center text-blue-400">
                                      <Calendar className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-blue-400 uppercase font-bold tracking-wider mb-0.5">Deadline</p>
                                      <p className="text-sm font-semibold">{program.deadline ? format(new Date(program.deadline), 'MMM d, yyyy') : 'Rolling'}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center text-blue-400">
                                      <DollarSign className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-blue-400 uppercase font-bold tracking-wider mb-0.5">Cost</p>
                                      <p className="text-sm font-semibold">{program.cost ? `$${program.cost.toLocaleString()}` : 'Free / Varies'}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center text-blue-400">
                                      <Home className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-blue-400 uppercase font-bold tracking-wider mb-0.5">Housing</p>
                                      <p className="text-sm font-semibold">{program.isResidential ? 'Residential' : 'Day / Online'}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center text-blue-400">
                                      <Calendar className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-blue-400 uppercase font-bold tracking-wider mb-0.5">Dates</p>
                                      <p className="text-sm font-semibold">
                                        {program.startDate ? format(new Date(program.startDate), 'MMM d') : 'TBD'} - {program.endDate ? format(new Date(program.endDate), 'MMM d') : 'TBD'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
 
                                {program.notes && (
                                  <div className="mb-8 p-4 bg-blue-50 rounded border-l-2 border-blue-200">
                                    <p className="text-[10px] text-blue-400 uppercase font-bold tracking-wider mb-1.5">Counselor Notes</p>
                                    <p className="text-sm text-blue-600 line-clamp-2 font-medium leading-relaxed">"{program.notes}"</p>
                                  </div>
                                )}
 
                                <div className="flex items-center justify-between pt-5 border-t border-blue-100 mt-auto">
                                  <button 
                                    onClick={() => setSelectedProgram(program)}
                                    className="flex items-center gap-1.5 text-sm font-bold text-blue-500 hover:text-blue-900 transition-colors uppercase tracking-tight"
                                  >
                                    <Info className="w-4 h-4" />
                                    View Details
                                  </button>
                                  {program.website && (
                                    <a 
                                      href={program.website} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 text-sm font-bold text-blue-900 hover:text-blue-700 transition-colors uppercase tracking-tight"
                                    >
                                      Website
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <div className="bg-white rounded border border-blue-200 overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-blue-50 border-b border-blue-200">
                              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-blue-400">Program</th>
                              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-blue-400 hidden lg:table-cell">Institution</th>
                              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-blue-400 hidden md:table-cell">Category</th>
                              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-blue-400">Deadline</th>
                              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-blue-400 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-100">
                            {filteredPrograms.map((program) => (
                              <tr key={program.id} className="hover:bg-blue-50/50 transition-colors group">
                                <td className="px-6 py-4">
                                  <p className="font-bold text-blue-900">{program.name}</p>
                                  <p className="text-xs text-blue-500 lg:hidden font-medium">{program.institution}</p>
                                </td>
                                <td className="px-6 py-4 hidden lg:table-cell">
                                  <p className="text-sm text-blue-600 font-medium">{program.institution}</p>
                                </td>
                                <td className="px-6 py-4 hidden md:table-cell">
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-500 text-[9px] font-bold uppercase tracking-widest rounded">
                                    {program.category}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-sm text-blue-600 font-mono">
                                    {program.deadline ? format(new Date(program.deadline), 'MMM d, yyyy') : 'Rolling'}
                                  </p>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => setSelectedProgram(program)}
                                      className="p-2 hover:bg-blue-100 rounded text-blue-400 hover:text-blue-900 transition-colors"
                                      title="View Details"
                                    >
                                      <Info className="w-4 h-4" />
                                    </button>
                                    {isAdmin && (
                                      <>
                                        <button 
                                          onClick={() => {
                                            setEditingProgram(program);
                                            setIsFormOpen(true);
                                          }}
                                          className="p-2 hover:bg-blue-100 rounded text-blue-400 hover:text-blue-900 transition-colors"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button 
                                          onClick={() => handleDelete(program.id)}
                                          className="p-2 hover:bg-red-50 rounded text-blue-400 hover:text-red-600 transition-colors"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    <div className="bg-white rounded border border-blue-200 p-16 text-center shadow-sm">
                      <div className="w-16 h-16 bg-blue-50 rounded flex items-center justify-center mx-auto mb-6">
                        <Search className="w-8 h-8 text-blue-200" />
                      </div>
                      <h3 className="text-xl font-bold text-blue-900 mb-2">No programs found</h3>
                      <p className="text-blue-500 max-w-xs mx-auto">Try adjusting your search or filters, or add a new program to the database.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-12">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                      <h2 className="text-2xl font-bold text-blue-900">User Management</h2>
                      <p className="text-blue-500 text-sm font-medium">Manage roles and access for all system users.</p>
                    </div>
                    
                    <form onSubmit={handleInviteUser} className="flex gap-2 w-full md:w-auto">
                      <div className="relative flex-1 md:w-64">
                        <input 
                          type="email" 
                          placeholder="Counselor Email" 
                          required
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="w-full pl-4 pr-4 py-2.5 bg-white border border-blue-200 rounded focus:outline-none focus:border-blue-900 text-sm"
                        />
                      </div>
                      <button 
                        type="submit"
                        disabled={isInviting}
                        className="bg-blue-900 text-white px-6 py-2.5 rounded font-bold text-xs uppercase tracking-widest hover:bg-blue-800 transition-all disabled:opacity-50"
                      >
                        {isInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Invite'}
                      </button>
                    </form>
                  </div>

                  {invitations.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Pending Invitations</h3>
                      <div className="bg-white rounded border border-blue-200 overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                          <tbody className="divide-y divide-blue-100">
                            {invitations.map((inv) => (
                              <tr key={inv.id} className="hover:bg-blue-50/50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-blue-50 rounded flex items-center justify-center">
                                      <Plus className="w-4 h-4 text-blue-300" />
                                    </div>
                                    <p className="text-sm font-bold text-blue-900">{inv.email}</p>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-blue-50 text-blue-400 rounded">
                                    {inv.role}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-[10px] text-blue-400 font-medium">Invited {format(new Date(inv.createdAt), 'MMM d, yyyy')}</p>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button 
                                    onClick={() => handleDeleteInvitation(inv.id)}
                                    className="p-2 hover:bg-red-50 rounded text-blue-400 hover:text-red-600 transition-colors"
                                    title="Cancel Invitation"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Active Users</h3>
                    <div className="bg-white rounded border border-blue-200 overflow-hidden shadow-sm">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-blue-50 border-b border-blue-200">
                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-blue-400">User</th>
                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-blue-400">Email</th>
                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-blue-400">Role</th>
                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-blue-400 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100">
                        {users.map((u) => (
                          <tr key={u.uid} className="hover:bg-blue-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {u.photoURL ? (
                                  <img src={u.photoURL} alt="" className="w-8 h-8 rounded" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                                    <UserIcon className="w-4 h-4 text-blue-400" />
                                  </div>
                                )}
                                <p className="font-bold text-blue-900">{u.displayName || 'Anonymous'}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm text-blue-600 font-medium">{u.email}</p>
                            </td>
                            <td className="px-6 py-4">
                              <select 
                                value={u.role}
                                onChange={(e) => handleUpdateUserRole(u.uid, e.target.value as Role)}
                                disabled={u.uid === user?.uid} // Can't change own role here
                                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-blue-100 rounded border-none focus:ring-0 cursor-pointer disabled:opacity-50 hover:bg-blue-200 transition-colors"
                              >
                                <option value="admin">Admin</option>
                                <option value="counselor">Counselor</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {u.uid !== user?.uid && (
                                <button 
                                  onClick={() => handleDeleteUser(u.uid)}
                                  className="p-2 hover:bg-red-50 rounded text-blue-400 hover:text-red-600 transition-colors"
                                  title="Delete User"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

        <AnimatePresence>
          {selectedProgram && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedProgram(null)}
                className="absolute inset-0 bg-blue-900/60 backdrop-blur-[2px]"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                className="relative bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded shadow-2xl"
              >
                <div className="sticky top-0 bg-white border-b border-blue-100 px-8 py-6 flex items-center justify-between z-10">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold uppercase tracking-widest rounded">
                      {selectedProgram.category}
                    </span>
                    <h2 className="text-xl font-bold text-blue-900 uppercase tracking-tight">Program Details</h2>
                  </div>
                  <button 
                    onClick={() => setSelectedProgram(null)}
                    className="p-2 hover:bg-blue-100 rounded transition-colors text-blue-400 hover:text-blue-900"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-8 space-y-10">
                  <div>
                    <h3 className="text-3xl font-bold text-blue-900 mb-3 leading-tight">
                      {selectedProgram.name}
                    </h3>
                    <p className="text-lg text-blue-500 font-medium flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-blue-400" />
                      {selectedProgram.institution} • {selectedProgram.location || 'Remote'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded flex items-center justify-center text-blue-400">
                          <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest mb-0.5">Application Deadline</p>
                          <p className="text-lg font-bold text-blue-900">{selectedProgram.deadline ? format(new Date(selectedProgram.deadline), 'MMMM d, yyyy') : 'Rolling Admissions'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded flex items-center justify-center text-blue-400">
                          <DollarSign className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest mb-0.5">Program Cost</p>
                          <p className="text-lg font-bold text-blue-900">{selectedProgram.cost ? `$${selectedProgram.cost.toLocaleString()}` : 'Free / Varies'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded flex items-center justify-center text-blue-400">
                          <Home className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest mb-0.5">Housing & Residential</p>
                          <p className="text-lg font-bold text-blue-900">{selectedProgram.isResidential ? 'Residential (Housing Provided)' : 'Day Program / Online'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded flex items-center justify-center text-blue-400">
                          <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest mb-0.5">Program Dates</p>
                          <p className="text-lg font-bold text-blue-900">
                            {selectedProgram.startDate ? format(new Date(selectedProgram.startDate), 'MMMM d') : 'TBD'} - {selectedProgram.endDate ? format(new Date(selectedProgram.endDate), 'MMMM d, yyyy') : 'TBD'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-8">
                      {selectedProgram.eligibility && (
                        <div>
                          <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest mb-3">Eligibility & Requirements</p>
                          <p className="text-blue-600 leading-relaxed font-medium">{selectedProgram.eligibility}</p>
                        </div>
                      )}
                      
                      {selectedProgram.selectivity && (
                        <div>
                          <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest mb-3">Selectivity & Credibility</p>
                          <p className="text-blue-600 leading-relaxed font-medium">{selectedProgram.selectivity}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedProgram.notes && (
                    <div className="p-6 bg-blue-50 rounded border-l-4 border-blue-200">
                      <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest mb-3">Counselor Notes</p>
                      <p className="text-blue-600 font-medium leading-relaxed italic">"{selectedProgram.notes}"</p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-blue-100">
                    {selectedProgram.website && (
                      <a 
                        href={selectedProgram.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-4 px-6 bg-blue-900 text-white rounded font-bold uppercase tracking-widest text-xs hover:bg-blue-800 transition-all shadow-lg shadow-blue-200"
                      >
                        Visit Official Website
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button 
                      onClick={() => setSelectedProgram(null)}
                      className="flex-1 py-4 px-6 bg-blue-100 text-blue-600 rounded font-bold uppercase tracking-widest text-xs hover:bg-blue-200 transition-all"
                    >
                      Close Details
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Form Modal */}
        <AnimatePresence>
          {isFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsFormOpen(false)}
                className="absolute inset-0 bg-blue-900/60 backdrop-blur-[2px]"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded shadow-2xl"
              >
                <div className="sticky top-0 bg-white border-b border-blue-100 px-8 py-6 flex items-center justify-between z-10">
                  <h2 className="text-xl font-bold text-blue-900 uppercase tracking-tight">
                    {editingProgram ? 'Edit Program' : 'Add New Program'}
                  </h2>
                  <button 
                    onClick={() => setIsFormOpen(false)}
                    className="p-2 hover:bg-blue-100 rounded transition-colors text-blue-400 hover:text-blue-900"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const rawData = {
                      name: formData.get('name') as string,
                      institution: formData.get('institution') as string,
                      location: formData.get('location') as string,
                      category: formData.get('category') as string,
                      deadline: formData.get('deadline') as string,
                      startDate: formData.get('startDate') as string,
                      endDate: formData.get('endDate') as string,
                      cost: Number(formData.get('cost')) || 0,
                      isResidential: formData.get('isResidential') === 'on',
                      eligibility: formData.get('eligibility') as string,
                      website: formData.get('website') as string,
                      selectivity: formData.get('selectivity') as string,
                      notes: formData.get('notes') as string,
                    };

                    // Filter out empty strings for optional fields to keep database clean
                    const data = Object.fromEntries(
                      Object.entries(rawData).filter(([_, v]) => v !== "")
                    );

                    try {
                      if (editingProgram) {
                        await updateDoc(doc(db, 'programs', editingProgram.id), data);
                      } else {
                        await addDoc(collection(db, 'programs'), {
                          ...data,
                          createdBy: user?.uid,
                          createdAt: new Date().toISOString(),
                        });
                      }
                      setIsFormOpen(false);
                    } catch (error) {
                      handleFirestoreError(error, editingProgram ? OperationType.UPDATE : OperationType.CREATE, 'programs');
                    }
                  }}
                  className="p-8 space-y-8"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Program Name *</label>
                      <input required name="name" defaultValue={editingProgram?.name} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Institution *</label>
                      <input required name="institution" defaultValue={editingProgram?.institution} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Location</label>
                      <input name="location" defaultValue={editingProgram?.location} placeholder="e.g. Boston, MA" className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Category *</label>
                      <select required name="category" defaultValue={editingProgram?.category || 'STEM'} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium appearance-none cursor-pointer">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Deadline</label>
                      <input type="date" name="deadline" defaultValue={editingProgram?.deadline} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Cost ($)</label>
                      <input type="number" name="cost" defaultValue={editingProgram?.cost} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Start Date</label>
                      <input type="date" name="startDate" defaultValue={editingProgram?.startDate} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">End Date</label>
                      <input type="date" name="endDate" defaultValue={editingProgram?.endDate} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Website URL</label>
                    <input type="url" name="website" defaultValue={editingProgram?.website} placeholder="https://" className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Eligibility / Requirements</label>
                    <textarea name="eligibility" defaultValue={editingProgram?.eligibility} rows={2} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium resize-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Selectivity / Credibility</label>
                    <textarea name="selectivity" defaultValue={editingProgram?.selectivity} rows={2} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium resize-none" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Counselor Notes</label>
                    <textarea name="notes" defaultValue={editingProgram?.notes} rows={3} className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded focus:ring-2 focus:ring-blue-900/5 focus:border-blue-400 focus:bg-white transition-all outline-none font-medium resize-none" />
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded border border-blue-200">
                    <input type="checkbox" name="isResidential" defaultChecked={editingProgram?.isResidential} id="isResidential" className="w-5 h-5 rounded border-blue-300 text-blue-900 focus:ring-blue-900" />
                    <label htmlFor="isResidential" className="text-sm font-bold text-blue-700 cursor-pointer uppercase tracking-tight">This is a residential program (housing provided)</label>
                  </div>

                  <div className="pt-6 flex gap-3 border-t border-blue-100">
                    <button 
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="flex-1 py-4 px-6 bg-blue-100 text-blue-600 rounded font-bold uppercase tracking-widest text-xs hover:bg-blue-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-[2] py-4 px-6 bg-blue-900 text-white rounded font-bold uppercase tracking-widest text-xs hover:bg-blue-800 transition-all shadow-lg shadow-blue-200"
                    >
                      {editingProgram ? 'Save Changes' : 'Add Program'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-blue-200 mt-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-200 rounded flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-blue-400">ProgramManager v1.0</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">© 2026 Independent College Counselors Association. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
