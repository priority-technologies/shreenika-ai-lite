import React, { useState, useRef, useEffect } from "react";
import { Lead } from "../types";
import { Upload, Plus, Search, MoreVertical, X } from "lucide-react";
import { apiFetch } from "../services/api";

const LeadManager: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newLead, setNewLead] = useState({
    firstName: "",
    lastName: "",
    countryCode: "+1",
    phone: "",
    email: "",
    companyName: "",
    totalEmployees: "",
    address: "",
    website: ""
  });

  const COUNTRY_CODES = [
    { code: "+1", label: "US/Canada" },
    { code: "+44", label: "UK" },
    { code: "+91", label: "India" },
    { code: "+61", label: "Australia" },
    { code: "+86", label: "China" },
    { code: "+81", label: "Japan" },
    { code: "+33", label: "France" },
    { code: "+49", label: "Germany" },
    { code: "+39", label: "Italy" },
    { code: "+34", label: "Spain" }
  ];

  /* =========================
     LOAD CONTACTS (FIXED)
  ========================= */
  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/contacts");
      console.log("✅ Loaded leads:", data);
      setLeads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Failed to load contacts:", err);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     CSV IMPORT (FIXED)
  ========================= */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append("file", file);

      await apiFetch("/contacts/import", {
        method: "POST",
        body: formData
      });

      await loadLeads();
      alert("Contacts imported successfully");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "CSV import failed");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  /* =========================
     ADD / EDIT CONTACT (FIXED)
  ========================= */
  const handleAddManualLead = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate phone is numeric
    if (!/^\d+$/.test(newLead.phone.replace(/[\s\-\(\)]/g, ''))) {
      alert('Phone number must contain only digits (and optional spaces/dashes)');
      return;
    }

    // Validate email has @
    if (!newLead.email.includes('@')) {
      alert('Email must contain @ symbol');
      return;
    }

    // Combine country code with phone
    const fullPhone = newLead.countryCode + newLead.phone.replace(/[\s\-\(\)]/g, '');

    const payload = {
      firstName: newLead.firstName,
      lastName: newLead.lastName,
      phone: fullPhone,
      email: newLead.email,
      address: newLead.address,
      company: {
        name: newLead.companyName,
        employees: newLead.totalEmployees ? Number(newLead.totalEmployees) : undefined,
        website: newLead.website
      }
    };

    try {
      if (editingLeadId) {
        const saved = await apiFetch(`/contacts/${editingLeadId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setLeads(leads.map(l => (l.id === editingLeadId ? saved : l)));
      } else {
        const saved = await apiFetch("/contacts", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setLeads([saved, ...leads]);
      }

      resetForm();
      alert("Contact saved successfully");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to save contact");
    }
  };

  /* =========================
     DELETE CONTACT (FIXED)
  ========================= */
  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this contact?")) return;

    try {
      await apiFetch(`/contacts/${id}`, { method: "DELETE" });
      setLeads(leads.filter(l => l.id !== id));
      setOpenMenuId(null);
      alert("Contact deleted");
    } catch (err: any) {
      alert(err.message || "Delete failed");
    }
  };

  /* =========================
     EDIT CONTACT (FIXED)
  ========================= */
  const handleEdit = (lead: Lead) => {
    setEditingLeadId(lead.id);
    // Parse country code from phone if present, otherwise default to +1
    let countryCode = "+1";
    let phoneWithoutCode = lead.phone;
    if (lead.phone && lead.phone.startsWith("+")) {
      const match = lead.phone.match(/^\+\d+/);
      if (match) {
        countryCode = match[0];
        phoneWithoutCode = lead.phone.substring(countryCode.length);
      }
    }
    setNewLead({
      firstName: lead.firstName,
      lastName: lead.lastName,
      countryCode,
      phone: phoneWithoutCode,
      email: lead.email,
      companyName: lead.company?.name || "",
      totalEmployees: lead.company?.employees?.toString() || "",
      address: lead.address || "",
      website: lead.company?.website || ""
    });
    setIsUploadModalOpen(true);
    setOpenMenuId(null);
  };

  const resetForm = () => {
    setEditingLeadId(null);
    setIsUploadModalOpen(false);
    setNewLead({
      firstName: "",
      lastName: "",
      countryCode: "+1",
      phone: "",
      email: "",
      companyName: "",
      totalEmployees: "",
      address: "",
      website: ""
    });
  };

  /* =========================
     SEARCH FILTER
  ========================= */
  const filteredLeads = leads.filter(l =>
    l.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.company?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-slate-500">Upload and manage your contact lists.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsUploadModalOpen(true)} 
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Contact
          </button>

          <input ref={fileInputRef} type="file" hidden accept=".csv" onChange={handleFileUpload} />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="border px-4 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> Import CSV
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading contacts...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No contacts yet. Add your first contact or import a CSV.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Company & Role</th>
                  <th className="p-4">Contact</th>
                  <th className="p-4">Location</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLeads.map(lead => (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <td className="p-4 text-sm font-medium text-slate-900">
                      {lead.firstName} {lead.lastName}
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-slate-900">{lead.company?.name || "-"}</div>
                      {lead.company?.employees && (
                        <div className="text-xs text-slate-500">{lead.company.employees} employees</div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-slate-900">{lead.email}</div>
                      <div className="text-sm text-slate-500">{lead.phone}</div>
                    </td>
                    <td className="p-4 text-sm text-slate-500">{lead.address || "-"}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {lead.status || "New"}
                      </span>
                    </td>
                    <td className="p-4 text-right relative">
                      <button 
                        onClick={() => setOpenMenuId(openMenuId === lead.id ? null : lead.id)}
                        className="p-2 hover:bg-slate-100 rounded"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === lead.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 mt-2 bg-white border rounded-lg shadow-lg z-20 w-32">
                            <button 
                              onClick={() => handleEdit(lead)} 
                              className="block w-full text-left px-4 py-2 hover:bg-slate-100 text-sm"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDelete(lead.id)} 
                              className="block w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editingLeadId ? "Edit Contact" : "Add Contact"}
              </h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddManualLead} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input 
                  required 
                  placeholder="First Name"
                  className="border rounded-lg p-2"
                  value={newLead.firstName}
                  onChange={e => setNewLead({ ...newLead, firstName: e.target.value })}
                />
                <input 
                  required 
                  placeholder="Last Name"
                  className="border rounded-lg p-2"
                  value={newLead.lastName}
                  onChange={e => setNewLead({ ...newLead, lastName: e.target.value })}
                />
              </div>

              <input
                required
                type="email"
                placeholder="Email (e.g. user@example.com)"
                className="w-full border rounded-lg p-2"
                value={newLead.email}
                onChange={e => setNewLead({ ...newLead, email: e.target.value })}
              />

              <div className="flex gap-2">
                <select
                  required
                  className="w-24 border rounded-lg p-2"
                  value={newLead.countryCode}
                  onChange={e => setNewLead({ ...newLead, countryCode: e.target.value })}
                >
                  {COUNTRY_CODES.map(cc => (
                    <option key={cc.code} value={cc.code}>
                      {cc.code} {cc.label}
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="tel"
                  placeholder="Phone number (digits only)"
                  className="flex-1 border rounded-lg p-2"
                  value={newLead.phone}
                  onChange={e => {
                    // Allow only digits, spaces, dashes, and parentheses
                    const value = e.target.value.replace(/[^\d\s\-()]/g, '');
                    setNewLead({ ...newLead, phone: value });
                  }}
                />
              </div>

              <input 
                required 
                placeholder="Company Name"
                className="w-full border rounded-lg p-2"
                value={newLead.companyName}
                onChange={e => setNewLead({ ...newLead, companyName: e.target.value })}
              />

              <input 
                placeholder="Total Employees"
                type="number"
                className="w-full border rounded-lg p-2"
                value={newLead.totalEmployees}
                onChange={e => setNewLead({ ...newLead, totalEmployees: e.target.value })}
              />

              <input 
                required 
                placeholder="Office Address"
                className="w-full border rounded-lg p-2"
                value={newLead.address}
                onChange={e => setNewLead({ ...newLead, address: e.target.value })}
              />

              <input 
                placeholder="Website"
                type="url"
                className="w-full border rounded-lg p-2"
                value={newLead.website}
                onChange={e => setNewLead({ ...newLead, website: e.target.value })}
              />

              <div className="flex gap-2 pt-4">
                <button 
                  type="button" 
                  onClick={resetForm}
                  className="flex-1 border px-4 py-2 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                >
                  {editingLeadId ? "Update" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadManager;