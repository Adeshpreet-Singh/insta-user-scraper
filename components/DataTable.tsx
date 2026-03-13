'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ContactReveal from './ContactReveal';

interface InstagramProfile {
    _id?: string;
    username: string;
    fullName?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
    biography?: string;
    url: string;
    profilePicUrl?: string;
    businessCategoryName?: string | null;
    verified?: boolean;
    contacted?: boolean;
    status: 'new' | 'for design reference' | 'can contact' | 'contacted' | 'Proposal Sent' | 'Contract Sent' | 'Negotiating' | 'Closed Won' | 'Closed Lost';
    externalUrl?: string;
    externalUrls?: { title?: string; url: string }[];
    updatedAt?: string | Date;
    aiAnalysis?: {
        category?: string;
        painPoints?: string[];
        coldMessage?: string;
        hinglishMessage?: string;
        icebreaker?: string;
        hinglishIcebreaker?: string;
        coldCallOpener?: string;
        whatsappScript?: string;
        followUpStrategy?: string;
        estimatedAnnualROI? : string;
        bestTimeToCall?: string;
        indianStrategy?: string;
        projectValueINR?: number;
        estimatedProjectValue?: string;
        engagementAnalysis?: string;
        conversationHooks?: string[];
        opportunityCost?: string;
        personalityVibe?: string;
        contentStrategy?: string[];
        objectionHandlers?: { objection: string; response: string }[];
        conversionChance?: number;
        qualityGrade?: string;
        rationale?: string;
        leadScore?: number;
        outreachPriority?: string;
        analyzedAt?: string | Date;
    };
    privateNotes?: string;
}








interface DataTableProps {
    data: InstagramProfile[];
}

// Helper to check if a lead actually has meaningful AI analysis data
const hasAnalysis = (analysis: any): boolean => {
    if (!analysis) return false;
    return !!(
        analysis.hinglishMessage ||
        analysis.indianStrategy ||
        (analysis.painPoints && analysis.painPoints.length > 0)
    );
};

// Helper to extract emails and phone numbers from profile
const extractLeads = (profile?: InstagramProfile) => {
    if (!profile) return { emails: [], phones: [], whatsapp: [] };
    const text = profile.biography || '';
    const externalUrl = profile.externalUrl || '';

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

    const emails = Array.from(new Set(text.match(emailRegex) || []));
    const phones = Array.from(new Set(text.match(phoneRegex) || []));
    const whatsapp: string[] = [];

    // Extract from external URL (common for WhatsApp)
    if (externalUrl.includes('wa.me') || externalUrl.includes('whatsapp.com')) {
        const waPhone = externalUrl.match(/[\d+]{10,}/);
        if (waPhone) whatsapp.push(waPhone[0]);
    }

    // Filter out whatsapp numbers from phones to avoid duplication if they appear in both
    const uniquePhones = phones.filter(p => !whatsapp.includes(p.replace(/\D/g, '')));

    return { emails, phones: uniquePhones, whatsapp };
};

export default function DataTable({ data: initialData }: DataTableProps) {
    const [localData, setLocalData] = useState<InstagramProfile[]>(initialData);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [followerRange, setFollowerRange] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');

    const [sortConfig, setSortConfig] = useState<{ key: keyof InstagramProfile; direction: 'asc' | 'desc' }>({
        key: 'followersCount',
        direction: 'desc'
    });
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; ids: string[] }>({ isOpen: false, ids: [] });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Ref to prevent duplicate API requests on double-clicks
    const activeRequests = useRef<Set<string>>(new Set());

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalLeads, setTotalLeads] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // AI Analysis state
    const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
    const [analysisModal, setAnalysisModal] = useState<{
        isOpen: boolean;
        leadId?: string;
        data?: {
            id: string;
            category?: string;
            painPoints?: string[];
            coldCallOpener?: string;
            conversationHooks?: string[];
            engagementAnalysis?: string;
            estimatedProjectValue?: string;
            contentStrategy?: string[];
            objectionHandlers?: { objection: string; response: string }[];
            coldMessage?: string;
            conversionChance?: number;
            qualityGrade?: string;
            rationale?: string;
            strategicRationale?: string;
            hinglishMessage?: string;
            hinglishIcebreaker?: string;
            indianStrategy?: string;
            whatsappScript?: string;
            followUpStrategy?: string;
            projectValueINR?: number;
            estimatedAnnualROI?: string;
            leadScore?: number;
            outreachPriority?: string;
            bestTimeToCall?: string;
            opportunityCost?: string;
            status?: string;
            privateNotes?: string;
        };
        error?: string;
    }>({ isOpen: false });
    const [analysisLanguage, setAnalysisLanguage] = useState<'english' | 'hinglish'>('english');

    useEffect(() => {
        if (analysisModal.isOpen) {
            setAnalysisLanguage('english');
        }
    }, [analysisModal.isOpen]);

    const [scrapeModal, setScrapeModal] = useState<{
        isOpen: boolean;
        input: string;
        progress: Array<{ username: string; status: string; error?: string }>;
        isScraping: boolean;
        currentStatus: string;
    }>({
        isOpen: false,
        input: '',
        progress: [],
        isScraping: false,
        currentStatus: ''
    });

    // Stable fetch function
    const fetchLeads = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: '20',
                search: searchTerm,
                category: categoryFilter,
                range: followerRange,
                status: statusFilter,
                sortKey: sortConfig.key as string,
                sortDir: sortConfig.direction
            });

            const res = await fetch(`/api/leads?${params.toString()}`);
            const data = await res.json();
            if (data.leads) {
                setLocalData(data.leads);
                setTotalPages(data.totalPages);
                setTotalLeads(data.total);
            }
        } catch (error) {
            console.error('Failed to fetch leads:', error);
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, searchTerm, categoryFilter, followerRange, statusFilter, sortConfig]);



    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    const handleScrape = async () => {
        if (!scrapeModal.input.trim()) return;

        const usernames = scrapeModal.input
            .split('\n')
            .map(u => u.trim())
            .filter(u => u.length > 0);

        if (usernames.length === 0) return;

        setScrapeModal(prev => ({
            ...prev,
            isScraping: true,
            progress: usernames.map(u => ({ username: u, status: 'pending' })),
            currentStatus: 'Starting scrape...'
        }));

        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usernames })
            });

            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.replace('data: ', ''));

                            if (data.type === 'status') {
                                setScrapeModal(prev => ({ ...prev, currentStatus: data.message }));
                            } else if (data.type === 'progress') {
                                setScrapeModal(prev => ({
                                    ...prev,
                                    progress: prev.progress.map(p =>
                                        p.username.toLowerCase() === data.username.toLowerCase()
                                            ? { ...p, status: data.status, error: data.error }
                                            : p
                                    )
                                }));
                            } else if (data.type === 'complete') {
                                setScrapeModal(prev => ({ ...prev, isScraping: false, currentStatus: 'Complete!' }));
                                fetchLeads(); // Refresh list
                            } else if (data.type === 'error') {
                                setScrapeModal(prev => ({ ...prev, isScraping: false, currentStatus: `Error: ${data.message}` }));
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error('Scrape failed:', error);
            setScrapeModal(prev => ({ ...prev, isScraping: false, currentStatus: `Failed: ${error.message}` }));
        }
    };



    const handleUpdateLead = async (id: string, updates: Partial<InstagramProfile>) => {
        try {
            // Optimistic Update
            setLocalData(prev => prev.map(p => (p._id === id || p.username === id) ? { ...p, ...updates } : p));
            
            // Update Modal Data if open
            if (analysisModal.isOpen && analysisModal.data?.id === id) {
                setAnalysisModal(prev => ({
                    ...prev,
                    data: prev.data ? { ...prev.data, ...updates } : undefined
                }));
            }

            const response = await fetch('/api/leads/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, updates }),
            });

            if (!response.ok) throw new Error('Failed to update lead');
        } catch (error) {
            console.error('Update Error:', error);
            // Revert on error
            fetchLeads();
        }
    };

    const handleStatusUpdate = async (id: string, newStatus: InstagramProfile['status']) => {
        if (!id) return;

        // Optimistic UI update
        const leadIndex = localData.findIndex(l => l._id === id);
        if (leadIndex === -1) return;

        const oldData = [...localData];
        const newData = [...localData];
        newData[leadIndex] = { ...newData[leadIndex], status: newStatus };
        setLocalData(newData);

        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    status: newStatus,
                    // Auto-sync contacted boolean for compatibility
                    contacted: newStatus === 'contacted'
                })
            });
            if (!res.ok) throw new Error(`Update failed with status ${res.status}`);
        } catch (error) {
            console.error('Failed to update lead status:', error);
            setLocalData(oldData);
            fetchLeads(); // Revert/Sync on error
        }
    };





    const analyzeLead = async (id: string, silent: boolean = false) => {
        if (analyzingIds.has(id)) return;
        setAnalyzingIds(prev => new Set(prev).add(id));
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            if (!res.ok) throw new Error('Analysis failed');
            
            const updatedLead = await res.json();
            
            setLocalData(prev => prev.map(l => l._id === id ? { ...l, aiAnalysis: updatedLead.aiAnalysis } : l));
            
            if (!silent) {
                setAnalysisModal({ 
                    isOpen: true, 
                    leadId: id, 
                    data: {
                        ...(updatedLead.aiAnalysis || {}),
                        id: id,
                        status: updatedLead.status,
                        privateNotes: updatedLead.privateNotes
                    } 
                });
            }
        } catch (err: any) {
            console.error('Analysis failed:', err);
            if (!silent) {
                setAnalysisModal({ isOpen: true, error: err.message || 'Failed to analyze' });
            }
        } finally {
            setAnalyzingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleAnalyze = (id: string) => analyzeLead(id, false);

    const bulkAnalyzeLeads = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;

        // Filter out already analyzing IDs
        const toAnalyze = ids.filter(id => !analyzingIds.has(id));
        if (toAnalyze.length === 0) return;

        // Process in small batches of 3 to avoid timeouts/rate limits
        const batchSize = 3;
        for (let i = 0; i < toAnalyze.length; i += batchSize) {
            const batch = toAnalyze.slice(i, i + batchSize);
            await Promise.all(batch.map(id => analyzeLead(id, true)));
        }
        
        // Clear selection after bulk action
        setSelectedIds(new Set());
    };


    const handleDeleteLead = (id?: string) => {
        if (!id) return;
        setDeleteModal({ isOpen: true, ids: [id] });
    };

    const saveLeadNotes = async (leadId: string, notes: string, status?: string) => {
        try {
            const res = await fetch(`/api/leads`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: leadId, privateNotes: notes, status })
            });

            if (!res.ok) throw new Error('Failed to save notes');
            
            // Update local state
            setLocalData(prev => prev.map(lead => 
                lead._id === leadId ? { ...lead, privateNotes: notes, status: (status as any) || lead.status } : lead
            ));
            
            return true;
        } catch (error) {
            console.error('Error saving notes:', error);
            return false;
        }
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        setDeleteModal({ isOpen: true, ids: Array.from(selectedIds) });
    };

    const executeDeletion = async () => {
        const idsToDelete = deleteModal.ids;
        if (idsToDelete.length === 0) return;

        setDeleteModal({ isOpen: false, ids: [] });

        // Optimistic UI update
        const oldData = [...localData];
        const oldSelected = new Set(selectedIds);

        setLocalData(localData.filter(l => !idsToDelete.includes(l._id as string)));
        setSelectedIds(prev => {
            const next = new Set(prev);
            idsToDelete.forEach(id => next.delete(id));
            return next;
        });

        try {
            const res = await fetch(`/api/leads?id=${idsToDelete.join(',')}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Delete failed with status ${res.status}`);
            }

            fetchLeads();
        } catch (error: any) {
            console.error('Failed deletion:', error);
            setLocalData(oldData);
            setSelectedIds(oldSelected);
            setAnalysisModal({ isOpen: true, error: `Failed to delete items: ${error.message}` });
        }
    };




    const toggleSelectAll = () => {
        if (selectedIds.size === localData.length && localData.length > 0) {
            setSelectedIds(new Set());
        } else {
            const newSelected = new Set(localData.map(l => l._id).filter(id => !!id) as string[]);
            setSelectedIds(newSelected);
        }
    };

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };




    // Get unique categories for filter
    const categories = ['All', ...Array.from(new Set(localData.map(p => p.businessCategoryName).filter(Boolean)))] as string[];

    // Simplified sorting handler
    const handleSort = (key: keyof InstagramProfile) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
        setCurrentPage(1); // Reset to first page on sort
    };


    const downloadCSV = () => {
        const headers = ['Username', 'Full Name', 'Followers', 'Category', 'Emails', 'Phones', 'WhatsApp', 'URL'];
        const csvContent = [
            headers.join(','),
            ...localData.map(p => { // Use localData as it's the current page's data
                const { emails, phones, whatsapp } = extractLeads(p);
                return [
                    p.username,
                    `"${p.fullName || ''}"`,
                    p.followersCount || 0,
                    `"${p.businessCategoryName || 'N/A'}"`,
                    `"${emails.join('; ')}"`,
                    `"${phones.join('; ')}"`,
                    `"${whatsapp.join('; ')}"`,
                    p.url
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="w-full space-y-6">
            {/* Filters and Actions */}
            <div className="flex flex-col gap-6 p-4 sm:p-8 bg-slate-900/50">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative group">
                            <input
                                type="text"
                                placeholder="Search usernames, names or bios..."
                                className="w-full sm:w-80 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-600"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                            <div className="absolute right-3 top-3.5 text-slate-600 group-focus-within:text-indigo-400 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>

                        {selectedIds.size > 0 && (
                            <button
                                onClick={handleBulkDelete}
                                className="px-4 py-3 bg-rose-600/10 border border-rose-600/20 text-rose-500 rounded-xl text-sm font-black hover:bg-rose-600 hover:text-white transition-all flex items-center gap-2 animate-in fade-in slide-in-from-left-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete {selectedIds.size} Selected
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Impact Category</label>
                            <select
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                                value={categoryFilter}
                                onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
                            >
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Follower Range</label>
                            <select
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                                value={followerRange}
                                onChange={(e) => { setFollowerRange(e.target.value); setCurrentPage(1); }}
                            >
                                <option value="All">All Sizes</option>
                                <option value="0-1k">Micro (&lt;1k)</option>
                                <option value="1k-10k">Growing (1k-10k)</option>
                                <option value="10k-100k">Influencer (10k-100k)</option>
                                <option value="100k+">Authority (100k+)</option>
                            </select>
                        </div>

                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Status Filter</label>
                            <select
                                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                            >
                                <option value="All">All Leads</option>
                                <option value="new">New Leads</option>
                                <option value="for design reference">Design Refs</option>
                                <option value="can contact">Potential</option>
                                <option value="contacted">Contacted</option>
                            </select>

                        </div>

                    </div>
                </div>


                <div className="flex items-center gap-4 justify-end">
                    <div className="text-right">
                        <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">Leads Found</div>
                        <div className="text-2xl font-black text-indigo-400">{totalLeads.toLocaleString('en-US')}</div>
                    </div>

                    <button
                        onClick={() => setScrapeModal(prev => ({ ...prev, isOpen: true, input: '', progress: [], isScraping: false, currentStatus: '' }))}
                        className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Accounts
                    </button>

                    <button
                        onClick={downloadCSV}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export CSV
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-y-auto scrollbar-hide">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-20">
                        <tr className="bg-slate-800 border-b border-slate-700 shadow-sm text-[10px] sm:text-xs">
                            <th className="px-3 sm:px-4 py-4 text-left w-10">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500/50 transition-all cursor-pointer"
                                    checked={localData.length > 0 && selectedIds.size === localData.length}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider text-left">
                                <button
                                    onClick={() => handleSort('username')}
                                    className="flex items-center gap-1"
                                >
                                    User Profile {sortConfig.key === 'username' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider text-left">Pipeline</th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider text-right cursor-pointer hover:text-white" onClick={() => handleSort('followersCount')}>
                                Stats {sortConfig.key === 'followersCount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider cursor-pointer hover:text-white" onClick={() => handleSort('businessCategoryName')}>
                                Niche {sortConfig.key === 'businessCategoryName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider text-left">Updated</th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider">Contacts</th>
                            <th className="px-3 sm:px-4 py-4 font-bold text-slate-300 uppercase tracking-wider">Action</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-800">
                        {localData.map((profile, idx) => {

                            const { emails, phones, whatsapp } = extractLeads(profile);

                            // Collect unique links
                            const allLinks = new Map<string, string>();
                            if (profile.externalUrls) profile.externalUrls.forEach(l => l.url && allLinks.set(l.url, l.title || 'Link'));
                            if (profile.externalUrl && !allLinks.has(profile.externalUrl)) allLinks.set(profile.externalUrl, 'Web');
                            const linkEntries = Array.from(allLinks.entries());
                            const isAnalyzing = analyzingIds.has(profile._id as string);

                            return (
                                <React.Fragment key={profile._id || idx}>
                                <tr className="group border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors duration-300">
                                    <td className="px-3 sm:px-4 py-5">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500/50 transition-all cursor-pointer"
                                            checked={selectedIds.has(profile._id || '')}
                                            onChange={() => toggleSelect(profile._id || '')}
                                        />
                                    </td>
                                    <td className="px-3 sm:px-4 py-5">

                                        <div className="flex items-center gap-4">
                                            <img
                                                src={profile.profilePicUrl ? `/api/proxy?url=${encodeURIComponent(profile.profilePicUrl)}` : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                                                alt={profile.username}
                                                referrerPolicy="no-referrer"
                                                className="w-12 h-12 rounded-2xl border-2 border-slate-700 group-hover:border-indigo-500 transition-all object-cover shadow-lg"
                                                onError={(e) => { (e.target as HTMLImageElement).src = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'; }}
                                            />


                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5">
                                                    <a href={profile.url} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-100 hover:text-indigo-400 transition-colors text-base">
                                                        @{profile.username}
                                                    </a>
                                                    {profile.verified && <span className="text-blue-400"><svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.4-1.4 2.7 2.7 5.9-5.9 1.4 1.4-7.3 7.3z" /></svg></span>}
                                                </div>
                                                <div className="text-sm text-slate-400 font-medium">{profile.fullName}</div>
                                                <p className="text-xs text-slate-500 line-clamp-1 mt-1 italic max-w-xs">{profile.biography}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 sm:px-4 py-5 text-right whitespace-nowrap">
                                        <select
                                            value={profile.status || 'new'}
                                            onChange={(e) => handleStatusUpdate(profile._id!, e.target.value as any)}
                                            className={`
                                                text-[10px] font-black py-1.5 px-3 rounded-lg border appearance-none cursor-pointer transition-all uppercase tracking-tighter outline-none
                                                ${profile.status === 'contacted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                    profile.status === 'can contact' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                                        profile.status === 'for design reference' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                            'bg-slate-800 text-slate-400 border-slate-700'}
                                                hover:brightness-110 active:scale-95
                                            `}
                                        >
                                            <option value="new">New</option>
                                            <option value="for design reference">Ref</option>
                                            <option value="can contact">Contact</option>
                                            <option value="contacted">Done</option>
                                        </select>
                                    </td>


                                    <td className="px-3 sm:px-4 py-5 text-right">

                                        <div className="text-slate-100 font-bold text-lg leading-tight">
                                            {profile.followersCount?.toLocaleString('en-US') || 0}
                                        </div>

                                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">
                                            {profile.postsCount || 0} Posts
                                        </div>
                                    </td>
                                    <td className="px-2 sm:px-3 py-5 max-w-[120px]">
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 whitespace-normal line-clamp-2 text-center inline-block">
                                            {profile.businessCategoryName || 'General'}
                                        </span>
                                    </td>
                                    <td className="px-3 sm:px-4 py-5 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                        {profile.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : 'N/A'}
                                    </td>


                                    <td className="px-3 sm:px-4 py-5">
                                        <ContactReveal 
                                            emails={emails} 
                                            phones={phones} 
                                            whatsapp={whatsapp} 
                                        />
                                    </td>

                                    <td className="px-3 sm:px-4 py-5">
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-wrap gap-2 max-w-[150px] flex-1">
                                                {linkEntries.length > 0 ? (
                                                    linkEntries.map(([url, title], lIdx) => (
                                                        <a
                                                            key={lIdx}
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[10px] font-black text-indigo-400 hover:text-white uppercase px-2 py-1 rounded bg-indigo-400/5 border border-indigo-400/10 transition-all hover:bg-indigo-600"
                                                            title={url}
                                                        >
                                                            {title || 'Visit'}
                                                        </a>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-slate-700 italic">Static Profile</span>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => handleDeleteLead(profile._id)}
                                                className="p-1.5 rounded-lg text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 transition-all active:scale-90"
                                                title="Remove Entry"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    if (hasAnalysis(profile.aiAnalysis)) {
                                                        setAnalysisModal({ 
                                                            isOpen: true, 
                                                            leadId: profile._id as string, 
                                                            data: { 
                                                                ...(profile.aiAnalysis || {}),
                                                                id: profile._id as string,
                                                                status: profile.status,
                                                                privateNotes: profile.privateNotes
                                                            } 
                                                        });
                                                    } else {
                                                        handleAnalyze(profile._id as string);
                                                    }
                                                }}
                                                disabled={analyzingIds.has(profile._id as string)}
                                                className={`p-1.5 rounded-lg transition-all active:scale-90 flex items-center gap-1.5 group/btn ${
                                                    hasAnalysis(profile.aiAnalysis) 
                                                    ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10' 
                                                    : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                                                } ${analyzingIds.has(profile._id as string) ? 'opacity-50 cursor-wait' : ''}`}
                                                title={hasAnalysis(profile.aiAnalysis) ? "View Analysis" : "Analyze Lead"}
                                            >
                                                {analyzingIds.has(profile._id as string) ? (
                                                     <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                ) : hasAnalysis(profile.aiAnalysis) ? (
                                                    <>
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                        </svg>
                                                        {profile.aiAnalysis?.leadScore !== undefined && (
                                                            <span className="text-[10px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded-md shadow-sm">
                                                                {profile.aiAnalysis.leadScore}
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                    </svg>
                                                )}
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setAnalysisModal({ 
                                                        isOpen: true, 
                                                        leadId: profile._id as string, 
                                                        data: { 
                                                            ...(profile.aiAnalysis || {}),
                                                            id: profile._id as string,
                                                            status: profile.status,
                                                            privateNotes: profile.privateNotes
                                                        } 
                                                    });
                                                }}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all active:scale-90"
                                                title="Notes"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>


                                        </div>
                                    </td>

                                </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
                {localData.length === 0 && !isLoading && (
                    <div className="p-20 text-center text-slate-500 font-bold">
                        No leads found matching your criteria. Try widening your search!
                    </div>
                )}
                {isLoading && (
                    <div className="p-20 text-center text-indigo-400 font-bold animate-pulse">
                        Loading fresh leads...
                    </div>
                )}
            </div>
            
            {/* Pagination Controls */}
            <div className="flex items-center justify-between px-8 py-6 bg-slate-800/50 backdrop-blur-md rounded-b-3xl border-t border-slate-700/50">
                <div className="text-slate-400 text-sm font-medium">
                    Showing <span className="text-white font-bold">{localData.length}</span> of <span className="text-white font-bold">{totalLeads}</span> leads
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1 || isLoading}
                        className="p-2 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold"
                    >
                        Previous
                    </button>
                    <div className="flex items-center px-4 bg-slate-900 rounded-xl border border-slate-700">
                        <span className="text-slate-400 text-sm mr-2 font-medium">Page</span>
                        <span className="text-white font-bold">{currentPage}</span>
                        <span className="text-slate-400 text-sm mx-2 font-medium">of</span>
                        <span className="text-white font-bold">{totalPages}</span>
                    </div>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages || isLoading}
                        className="p-2 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold"
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* Floating Bulk Actions Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-10 duration-500">
                    <div className="bg-slate-900/90 backdrop-blur-xl border border-indigo-500/30 rounded-3xl p-3 shadow-2xl flex items-center gap-4 px-6">
                        <div className="flex flex-col border-r border-slate-700 pr-6 mr-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Selected</span>
                            <span className="text-xl font-black text-white">{selectedIds.size} Leads</span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <button
                                onClick={bulkAnalyzeLeads}
                                disabled={analyzingIds.size > 0}
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black transition-all shadow-lg active:scale-95 disabled:opacity-50"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                {analyzingIds.size > 0 ? "Analyzing..." : "Bulk Analyze"}
                            </button>
                            
                            <button
                                onClick={() => setDeleteModal({ isOpen: true, ids: Array.from(selectedIds) })}
                                className="flex items-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black transition-all shadow-lg active:scale-95"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                            </button>
                        </div>

                        <button 
                            onClick={() => setSelectedIds(new Set())}
                            className="bg-slate-800 hover:bg-slate-700 p-3 rounded-2xl text-slate-400 transition-all ml-2"
                            title="Clear selection"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Analysis & Error Modal */}
            {analysisModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setAnalysisModal({ isOpen: false })} />
                    <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
                        {analysisModal.error ? (
                            <div className="text-center">
                                <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                                    <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-black text-slate-100 mb-2">Error</h3>
                                <p className="text-rose-400 mb-8">{analysisModal.error}</p>
                                <button onClick={() => setAnalysisModal({ isOpen: false })} className="px-6 py-3 bg-slate-800 text-white rounded-xl text-sm font-black hover:bg-slate-700 transition-all">Close</button>
                            </div>
                        ) : analysisModal.data ? (
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <h3 className="text-2xl font-black text-slate-100 flex items-center gap-3">
                                        <span className="bg-indigo-500/20 text-indigo-400 p-2 rounded-xl">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                        </span>
                                        Cold Call Kit
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        {analysisModal.data.category && (
                                            <span className="text-xs font-bold uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-full">
                                                {analysisModal.data.category}
                                            </span>
                                        )}
                                        {analysisModal.data.qualityGrade && (
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${
                                                    analysisModal.data.qualityGrade.startsWith('A') ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                                    analysisModal.data.qualityGrade.startsWith('B') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                                    'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                }`}>
                                                    Grade {analysisModal.data.qualityGrade}
                                                </span>
                                                {analysisModal.data.conversionChance !== undefined && (
                                                    <span className="text-xs font-bold text-slate-400 bg-slate-800/50 px-2 py-1.5 rounded-full border border-slate-700/50">
                                                        {analysisModal.data.conversionChance}% Win
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <button onClick={() => setAnalysisModal({ isOpen: false })} className="text-slate-500 hover:text-white transition-colors">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Lead Management Controls */}
                                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs uppercase font-black tracking-widest text-indigo-400 flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                            Lead Management
                                        </h4>
                                        <div className="flex items-center gap-3">
                                            <select 
                                                value={analysisModal.data.status || 'New'}
                                                onChange={(e) => handleUpdateLead(analysisModal.data!.id, { status: e.target.value as any })}
                                                className={`text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-xl border appearance-none cursor-pointer transition-all ${
                                                    analysisModal.data.status === 'Closed Won' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                                    analysisModal.data.status === 'Closed Lost' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                                                    analysisModal.data.status === 'Proposal Sent' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                                                    'bg-slate-700/50 border-slate-600 text-slate-300'
                                                }`}
                                            >
                                                {['New', 'Contacted', 'Proposal Sent', 'Contract Sent', 'Negotiating', 'Closed Won', 'Closed Lost'].map(status => (
                                                    <option key={status} value={status} className="bg-slate-900">{status}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div className="relative">
                                        <textarea
                                            placeholder="Write internal notes about this lead... (e.g. key interactions, specific needs, hurdles)"
                                            defaultValue={analysisModal.data.privateNotes || ''}
                                            onBlur={(e) => {
                                                if (e.target.value !== analysisModal.data?.privateNotes) {
                                                    handleUpdateLead(analysisModal.data!.id, { privateNotes: e.target.value });
                                                }
                                            }}
                                            className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-4 text-sm text-slate-300 placeholder:text-slate-600 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all resize-none min-h-[100px] custom-scrollbar"
                                        />
                                        <div className="absolute bottom-3 right-3 opacity-30 group-focus-within:opacity-100 transition-opacity">
                                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </div>
                                    </div>
                                </div>

                                {/* Lead Score Rationale */}
                                {analysisModal.data.rationale && (
                                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4">
                                        <h4 className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            AI Qualification Rationale
                                        </h4>
                                        <p className="text-sm text-slate-300 italic leading-relaxed">"{analysisModal.data.rationale}"</p>
                                    </div>
                                )}

                                {/* Generated DM */}
                                {analysisModal.data.coldMessage && (
                                    <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-5 relative group">
                                        <div className="absolute -top-3 left-6 px-3 py-1 bg-indigo-600 text-[10px] font-black uppercase tracking-tighter text-white rounded-full shadow-lg">
                                            Ready-to-Send DM
                                        </div>
                                        <div className="mt-2">
                                            <p className="text-base text-slate-100 leading-relaxed font-medium whitespace-pre-wrap">{analysisModal.data.coldMessage}</p>
                                        </div>
                                        <div className="mt-4 flex justify-end">
                                            <button
                                                onClick={(e) => {
                                                    navigator.clipboard.writeText(analysisModal.data?.coldMessage || '');
                                                    const btn = e.currentTarget;
                                                    const text = btn.querySelector('span');
                                                    if (text) text.innerText = 'Copied to Clipboard!';
                                                    btn.classList.add('bg-emerald-600');
                                                    setTimeout(() => { 
                                                        if (text) text.innerText = 'Copy DM Content';
                                                        btn.classList.remove('bg-emerald-600');
                                                    }, 2000);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-xl active:scale-95"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                                <span>Copy DM Content</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Hinglish Pitch (Indian Special) */}
                                {analysisModal.data.hinglishMessage && (
                                    <div className="bg-gradient-to-br from-orange-500/10 to-emerald-500/10 border border-orange-500/20 rounded-2xl p-5 relative group">
                                        <div className="absolute -top-3 left-6 px-3 py-1 bg-orange-600 text-[10px] font-black uppercase tracking-tighter text-white rounded-full shadow-lg flex items-center gap-2">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>
                                            Indian Market Special (Hinglish)
                                        </div>
                                        <div className="mt-2">
                                            <p className="text-base text-slate-100 leading-relaxed font-medium whitespace-pre-wrap">{analysisModal.data.hinglishMessage}</p>
                                        </div>
                                        <div className="mt-4 flex justify-end">
                                            <button
                                                onClick={(e) => {
                                                    navigator.clipboard.writeText(analysisModal.data?.hinglishMessage || '');
                                                    const btn = e.currentTarget;
                                                    const text = btn.querySelector('span');
                                                    if (text) text.innerText = 'Copied!';
                                                    btn.classList.add('bg-emerald-600');
                                                    setTimeout(() => { 
                                                        if (text) text.innerText = 'Copy Hinglish Pitch';
                                                        btn.classList.remove('bg-emerald-600');
                                                    }, 2000);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black transition-all shadow-xl active:scale-95"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                                <span>Copy Hinglish Pitch</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Pain Points */}
                                {analysisModal.data.painPoints && analysisModal.data.painPoints.length > 0 && (
                                    <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6">
                                        <h4 className="text-xs uppercase font-black tracking-widest text-rose-400 mb-4 flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                            Critical Pain Points Identified ({analysisModal.data.painPoints.length})
                                        </h4>
                                        <div className="space-y-3">
                                            {analysisModal.data.painPoints.map((point: string, i: number) => (
                                                <div key={i} className="flex items-start gap-4">
                                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 text-xs font-black flex items-center justify-center mt-1">{i + 1}</span>
                                                    <p className="text-base text-slate-200 leading-relaxed font-medium">{point}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Cold Call Opener */}
                                {analysisModal.data.coldCallOpener && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-black tracking-widest text-blue-400 mb-3 flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                                            Cold Call Opener
                                        </h4>
                                        <div className="relative group">
                                            <p className="text-sm text-slate-200 bg-blue-500/5 border border-blue-500/15 rounded-xl p-4 italic leading-relaxed pr-24">{analysisModal.data.coldCallOpener}</p>
                                            <button
                                                onClick={(e) => {
                                                    navigator.clipboard.writeText(analysisModal.data?.coldCallOpener || '');
                                                    const btn = e.currentTarget;
                                                    const orig = btn.innerText;
                                                    btn.innerText = 'Copied!';
                                                    setTimeout(() => { btn.innerText = orig; }, 2000);
                                                }}
                                                className="absolute top-3 right-3 text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-md transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                                            >Copy</button>
                                        </div>
                                    </div>
                                )}

                                {/* Conversation Hooks */}
                                {analysisModal.data.conversationHooks && analysisModal.data.conversationHooks.length > 0 && (
                                    <div>
                                        <h4 className="text-[10px] uppercase font-black tracking-widest text-emerald-400 mb-3 flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Conversation Hooks — Ask These
                                        </h4>
                                        <div className="space-y-2">
                                            {analysisModal.data.conversationHooks.map((hook: string, i: number) => (
                                                <div key={i} className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 group/hook">
                                                    <span className="flex-shrink-0 text-emerald-500 mt-0.5">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                    </span>
                                                    <p className="text-sm text-slate-300 leading-relaxed flex-1">{hook}</p>
                                                    <button
                                                        onClick={() => navigator.clipboard.writeText(hook)}
                                                        className="flex-shrink-0 opacity-0 group-hover/hook:opacity-100 transition-opacity text-slate-500 hover:text-emerald-400"
                                                        title="Copy this question"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {analysisModal.data.engagementAnalysis && (
                                    <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-2xl p-6 mb-8">
                                        <h4 className="text-[10px] uppercase font-black tracking-widest text-cyan-400 mb-2 flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                            Engagement Analysis
                                        </h4>
                                        <p className="text-sm text-slate-300 leading-relaxed font-medium">{analysisModal.data.engagementAnalysis}</p>
                                    </div>
                                )}

                                {/* High-Ticket Context */}
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    {analysisModal.data.bestTimeToCall && (
                                        <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4">
                                            <h4 className="text-[10px] uppercase font-black tracking-widest text-amber-500 mb-2 flex items-center gap-2">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                Best Time to Call
                                            </h4>
                                            <p className="text-sm text-amber-200/80 font-bold">{analysisModal.data.bestTimeToCall}</p>
                                        </div>
                                    )}
                                    {analysisModal.data.opportunityCost && (
                                        <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4">
                                            <h4 className="text-[10px] uppercase font-black tracking-widest text-rose-500 mb-2 flex items-center gap-2">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                Opportunity Cost
                                            </h4>
                                            <p className="text-xs text-rose-200/80 font-medium">{analysisModal.data.opportunityCost}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-8">
                                    {/* Column 1: Core Analysis & Outreach */}
                                    <div className="space-y-6">
                                        {/* Lead Score Rationale */}
                                        {analysisModal.data.rationale && (
                                            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
                                                <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Lead Score Rationale</h4>
                                                <p className="text-base text-slate-200 leading-relaxed italic font-medium">"{analysisModal.data.rationale}"</p>
                                            </div>
                                        )}

                                        {/* Outreach Assets */}
                                        <div className="space-y-4">
                                            {/* Outreach Toggle & Actions */}
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
                                                    <button
                                                        onClick={() => setAnalysisLanguage('english')}
                                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${analysisLanguage === 'english' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                                    >English</button>
                                                    {analysisModal.data.hinglishMessage && (
                                                        <button
                                                            onClick={() => setAnalysisLanguage('hinglish')}
                                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${analysisLanguage === 'hinglish' ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                                                        >Hinglish</button>
                                                    )}
                                                </div>

                                                {/* WhatsApp Redirect */}
                                                {(() => {
                                                    const profile = localData.find(l => l._id === analysisModal.leadId);
                                                    const { phones, whatsapp } = extractLeads(profile);
                                                    const targetPhone = whatsapp[0] || phones[0];
                                                    const message = analysisLanguage === 'english' ? analysisModal.data?.coldMessage : analysisModal.data?.hinglishMessage;
                                                    
                                                    if (!targetPhone || !message) return null;

                                                    return (
                                                        <a
                                                            href={`https://wa.me/${targetPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-xl text-xs font-bold uppercase transition-all group shadow-lg shadow-green-500/20 hover:scale-105 active:scale-95"
                                                        >
                                                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                                                            WhatsApp
                                                        </a>
                                                    );
                                                })()}
                                            </div>

                                            {/* Messaging Context */}
                                            <div className={`rounded-2xl p-5 relative group transition-all duration-300 ${analysisLanguage === 'english' ? 'bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20' : 'bg-orange-500/5 border border-orange-500/20'}`}>
                                                <div className={`absolute -top-3 left-6 px-3 py-1 text-xs font-bold uppercase text-white rounded-full shadow-lg flex items-center gap-2 ${analysisLanguage === 'english' ? 'bg-indigo-600' : 'bg-orange-600'}`}>
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                                                    {analysisLanguage === 'english' ? 'English Pitch' : 'Hinglish Pitch'}
                                                </div>
                                                
                                                <div className="space-y-4 mt-2">
                                                    <div>
                                                        <p className={`text-xs font-bold uppercase mb-2 ${analysisLanguage === 'english' ? 'text-indigo-400/50' : 'text-orange-400/50'}`}>Cold Message Pitch</p>
                                                        <p className="text-base text-slate-100 mt-2 leading-relaxed font-medium pr-12">
                                                            {analysisLanguage === 'english' ? analysisModal.data?.coldMessage : analysisModal.data?.hinglishMessage}
                                                        </p>
                                                    </div>
                                                    
                                                    {analysisLanguage === 'hinglish' && analysisModal.data?.hinglishIcebreaker && (
                                                        <div className="pt-3 border-t border-orange-500/10">
                                                            <p className="text-xs font-bold text-orange-400/50 uppercase mb-1">Icebreaker (Quick DM)</p>
                                                            <p className="text-sm text-amber-400 italic leading-relaxed font-medium">
                                                                {analysisModal.data.hinglishIcebreaker}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        const text = analysisLanguage === 'english' 
                                                            ? (analysisModal.data?.coldMessage || '')
                                                            : `${analysisModal.data?.hinglishMessage}\n\nIcebreaker: ${analysisModal.data?.hinglishIcebreaker}`;
                                                        navigator.clipboard.writeText(text);
                                                        const btn = e.currentTarget;
                                                        btn.innerHTML = 'Copied!';
                                                        setTimeout(() => { btn.innerHTML = 'Copy'; }, 2000);
                                                    }}
                                                    className="absolute top-4 right-4 text-xs uppercase font-bold bg-slate-800 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all border border-slate-700 shadow-xl"
                                                >Copy</button>
                                            </div>

                                             {/* Follow-up Strategy */}
                                             {analysisModal.data?.followUpStrategy && (
                                                 <div className="bg-slate-800/20 border border-slate-700/30 rounded-2xl p-5">
                                                     <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider flex items-center gap-2">
                                                         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                         Follow-up Plan
                                                     </h4>
                                                     <p className="text-sm text-slate-300 leading-relaxed font-medium">{analysisModal.data.followUpStrategy}</p>
                                                 </div>
                                             )}
                                        </div>

                                        {/* Strategic Strategy */}
                                        {analysisModal.data?.indianStrategy && (
                                            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-6 relative">
                                                <div className="absolute -top-3 left-6 px-3 py-1 bg-indigo-600 text-xs font-bold uppercase text-white rounded-full shadow-lg">
                                                    🎯 Implementation Strategy
                                                </div>
                                                <p className="text-base text-slate-100 leading-relaxed font-medium mt-2">
                                                    {analysisModal.data.indianStrategy}
                                                </p>
                                            </div>
                                        )}

                                        {/* Strategic Insights Tags */}
                                        {analysisModal.data?.strategicRationale && (
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-2">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                    Strategic Rationale
                                                </h4>
                                                <div className="bg-cyan-500/5 border border-cyan-500/10 p-3 rounded-xl italic text-xs text-cyan-400 leading-relaxed shadow-sm">
                                                    "{analysisModal.data.strategicRationale}"
                                                </div>
                                            </div>
                                        )}



                                        {/* Objection Handlers */}
                                        {analysisModal.data.objectionHandlers && analysisModal.data.objectionHandlers.length > 0 && (
                                            <div className="space-y-3">
                                                <h4 className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider flex items-center gap-2">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                                    Objection Handlers
                                                </h4>
                                                <div className="grid gap-3">
                                                    {analysisModal.data.objectionHandlers.map((item: { objection: string; response: string }, i: number) => (
                                                        <div key={i} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 shadow-sm">
                                                            <p className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-1">Objection: {item.objection}</p>
                                                            <p className="text-sm text-slate-300 leading-relaxed font-medium">"{item.response}"</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Financial & ROI Section */}
                                        {(analysisModal.data.projectValueINR || analysisModal.data.leadScore) && (
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-800/40 rounded-2xl p-6 border border-slate-700/50">
                                                {analysisModal.data.projectValueINR && (
                                                    <div>
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Project Value (INR)</h4>
                                                        <p className="text-2xl font-bold text-green-400">₹{analysisModal.data.projectValueINR.toLocaleString('en-IN')}</p>
                                                    </div>
                                                )}
                                                {analysisModal.data.leadScore !== undefined && (
                                                    <div>
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Lead Score</h4>
                                                        <div className="flex items-center gap-2">
                                                            <div className="text-2xl font-bold text-indigo-400">{analysisModal.data.leadScore}</div>
                                                            <div className="text-xs font-bold text-slate-500 mt-1">/ 100</div>
                                                        </div>
                                                    </div>
                                                )}
                                                {analysisModal.data.estimatedAnnualROI && (
                                                    <div>
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Annual Impact</h4>
                                                        <p className="text-sm font-bold text-slate-100">{analysisModal.data.estimatedAnnualROI}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

            {/* Scrape Modal */}
            {scrapeModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !scrapeModal.isScraping && setScrapeModal(prev => ({ ...prev, isOpen: false }))} />
                    <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-black text-slate-100 italic">BULK SYNC ACCOUNTS</h3>
                            {!scrapeModal.isScraping && (
                                <button
                                    onClick={() => setScrapeModal(prev => ({ ...prev, isOpen: false }))}
                                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            )}
                        </div>

                        {!scrapeModal.isScraping && scrapeModal.progress.length === 0 ? (
                            <div className="space-y-6">
                                <p className="text-sm text-slate-400">Enter Instagram usernames to scrape and analyze (one per line). We'll process them one by one and stream updates.</p>
                                <textarea
                                    className="w-full h-48 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-slate-200 text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                                    placeholder="cristiano&#10;leomessi&#10;nike"
                                    value={scrapeModal.input}
                                    onChange={(e) => setScrapeModal(prev => ({ ...prev, input: e.target.value }))}
                                />
                                <button
                                    onClick={handleScrape}
                                    disabled={!scrapeModal.input.trim()}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black transition-all shadow-lg active:scale-95"
                                >
                                    START EXTRACTION
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full animate-pulse ${scrapeModal.isScraping ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                                        <span className="text-sm font-black text-slate-200 uppercase tracking-widest">{scrapeModal.currentStatus}</span>
                                    </div>
                                    <span className="text-xs text-slate-500 font-bold">{scrapeModal.progress.filter(p => p.status === 'success' || p.status === 'error').length} / {scrapeModal.progress.length} COMPLETED</span>
                                </div>

                                <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {scrapeModal.progress.map((p, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800/50">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-mono text-slate-500">#{i + 1}</span>
                                                <span className="text-sm font-bold text-slate-200">@{p.username}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {p.status === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />}
                                                {p.status === 'scraping' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                                                {p.status === 'analyzing' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />}
                                                {p.status === 'success' && <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" /></svg>}
                                                {p.status === 'error' && <span className="text-[10px] bg-rose-500/10 text-rose-500 px-2 py-0.5 rounded font-black uppercase" title={p.error}>FAILED</span>}
                                                <span className={`text-[10px] font-black uppercase tracking-tighter ${
                                                    p.status === 'success' ? 'text-emerald-500' : 
                                                    p.status === 'error' ? 'text-rose-500' : 
                                                    'text-slate-500'
                                                }`}>
                                                    {p.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {!scrapeModal.isScraping && (
                                    <button
                                        onClick={() => setScrapeModal(prev => ({ ...prev, isOpen: false }))}
                                        className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-black transition-all"
                                    >
                                        CLOSE DASHBOARD
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDeleteModal({ isOpen: false, ids: [] })} />
                    <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                            <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-black text-slate-100 text-center mb-2">Confirm Deletion</h3>
                        <p className="text-slate-400 text-center mb-8">
                            Are you sure you want to permanently remove {deleteModal.ids.length === 1 ? 'this entry' : `${deleteModal.ids.length} selected entries`}? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteModal({ isOpen: false, ids: [] })}
                                className="flex-1 px-6 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-700 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeDeletion}
                                className="flex-1 px-6 py-3 bg-rose-600 text-white rounded-xl text-sm font-black hover:bg-rose-500 transition-all"
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

