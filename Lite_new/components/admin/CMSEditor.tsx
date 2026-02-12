import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, X } from 'lucide-react';
import { apiFetch } from '../../services/api';

interface CMSEditorProps {
  navigate: (path: string) => void;
  type: 'privacy' | 'faqs';
}

interface Section {
  id: string;
  heading?: string;
  question?: string;
  message?: string;
  answer?: string;
}

const CMSEditor: React.FC<CMSEditorProps> = ({ navigate, type }) => {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCMSContent();
  }, [type]);

  const fetchCMSContent = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/admin/cms/${type}`);
      if (data && data.content) {
        const contentArray = type === 'privacy'
          ? data.content.sections || []
          : data.content.faqs || [];
        setSections(contentArray.length > 0 ? contentArray : [{ id: '1' }]);
      }
    } catch (err) {
      console.error('Failed to fetch CMS content:', err);
      setSections([{ id: '1' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSection = () => {
    setSections([
      ...sections,
      { id: `section-${Date.now()}` },
    ]);
  };

  const handleRemoveSection = (id: string) => {
    if (sections.length > 1) {
      setSections(sections.filter((s) => s.id !== id));
    }
  };

  const handleSectionChange = (id: string, field: string, value: string) => {
    setSections(
      sections.map((s) =>
        s.id === id ? { ...s, [field]: value } : s
      )
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        type,
        content:
          type === 'privacy'
            ? { sections }
            : { faqs: sections },
      };

      await apiFetch(`/admin/cms/${type}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }, 'core');

      setMessage('✅ Content saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Failed to save CMS content:', err);
      setMessage('❌ Failed to save content');
    } finally {
      setSaving(false);
    }
  };

  const title = type === 'privacy' ? 'Privacy & Terms' : 'FAQs';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate('/admin')}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
          <p className="text-slate-600 mt-1">Edit {title.toLowerCase()} content</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="p-4 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
          {message}
        </div>
      )}

      {/* Editor */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
        {sections.map((section, index) => (
          <div key={section.id} className="p-4 border border-slate-200 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {type === 'privacy' ? `Section ${index + 1}` : `Q&A ${index + 1}`}
              </h3>
              {sections.length > 1 && (
                <button
                  onClick={() => handleRemoveSection(section.id)}
                  className="p-1 hover:bg-red-50 rounded text-red-600"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {type === 'privacy' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Heading
                  </label>
                  <input
                    type="text"
                    value={section.heading || ''}
                    onChange={(e) =>
                      handleSectionChange(section.id, 'heading', e.target.value)
                    }
                    placeholder="Enter heading"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Message
                  </label>
                  <textarea
                    value={section.message || ''}
                    onChange={(e) =>
                      handleSectionChange(section.id, 'message', e.target.value)
                    }
                    placeholder="Enter message"
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Question
                  </label>
                  <input
                    type="text"
                    value={section.question || ''}
                    onChange={(e) =>
                      handleSectionChange(section.id, 'question', e.target.value)
                    }
                    placeholder="Enter question"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Answer
                  </label>
                  <textarea
                    value={section.answer || ''}
                    onChange={(e) =>
                      handleSectionChange(section.id, 'answer', e.target.value)
                    }
                    placeholder="Enter answer"
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>
              </>
            )}
          </div>
        ))}

        {/* Add Section Button */}
        <button
          onClick={handleAddSection}
          className="w-full flex items-center justify-center space-x-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-600 hover:text-blue-600"
        >
          <Plus className="w-5 h-5" />
          <span>Add {type === 'privacy' ? 'Section' : 'Q&A'}</span>
        </button>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-5 h-5" />
          <span>{saving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
};

export default CMSEditor;
