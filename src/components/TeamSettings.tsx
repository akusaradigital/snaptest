"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Users, UserPlus, LogOut, Crown, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface Team { id: string; name: string; owner_id: string; role: string; created_at: string; }
interface Member { user_id: string; role: string; created_at: string; }

export default function TeamSettings() {
  const { data: session } = useSession();
  const me = session?.user?.email ?? "";

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTeam = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team");
      const data = await res.json();
      const t = data.teams?.[0] ?? null;
      setTeam(t);
      if (t) {
        const mRes = await fetch(`/api/team/${t.id}/members`);
        const mData = await mRes.json();
        setMembers(mData.members ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTeam(); }, []);

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      toast.success("Team created!");
      setNewTeamName("");
      await loadTeam();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    if (!inviteEmail.trim() || !team) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/team/${team.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      toast.success(`${inviteEmail.trim()} added to team`);
      setInviteEmail("");
      await loadTeam();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!team) return;
    setBusy(true);
    try {
      const url = userId === me
        ? `/api/team/${team.id}/members`
        : `/api/team/${team.id}/members?user=${encodeURIComponent(userId)}`;
      await fetch(url, { method: "DELETE" });
      toast.success(userId === me ? "Left team" : "Member removed");
      await loadTeam();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 text-slate-400 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading team...</div>;

  return (
    <div className="space-y-4">
      {!team ? (
        <div>
          <p className="text-sm text-slate-500 mb-3">Create a team workspace to share history with teammates.</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Team name"
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createTeam()}
              className="input-field flex-1 text-sm"
            />
            <button
              type="button"
              onClick={createTeam}
              disabled={busy || !newTeamName.trim()}
              className="btn-primary text-xs px-4 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Team header */}
          <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <Users className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-indigo-800">{team.name}</p>
              <p className="text-xs text-indigo-500">{members.length} member{members.length !== 1 ? "s" : ""} · shared history</p>
            </div>
          </div>

          {/* Members list */}
          <div className="space-y-1.5">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {m.role === "owner" && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  <span className="text-slate-700 truncate">{m.user_id}</span>
                  {m.user_id === me && <span className="text-xs text-slate-400">(you)</span>}
                </div>
                {(m.user_id === me || team.owner_id === me) && m.role !== "owner" || m.user_id === me ? (
                  <button
                    type="button"
                    onClick={() => removeMember(m.user_id)}
                    disabled={busy}
                    className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition"
                    title={m.user_id === me ? "Leave team" : "Remove member"}
                  >
                    {m.user_id === me ? <LogOut className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {/* Invite */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Invite by Google email</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && invite()}
                className="input-field flex-1 text-sm"
              />
              <button
                type="button"
                onClick={invite}
                disabled={busy || !inviteEmail.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">They must sign in with that Google account to access shared history.</p>
          </div>
        </div>
      )}
    </div>
  );
}
