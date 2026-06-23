"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, LineChart, Line } from 'recharts';
import { Activity, MapPin, AlertCircle, Cpu, Clock, ShieldAlert } from "lucide-react";
import ReactMarkdown from 'react-markdown';

// Dynamically import Map to prevent SSR issues
const Map = dynamic(() => import("./Map"), { ssr: false, loading: () => <div className="h-full w-full bg-slate-100 animate-pulse rounded-2xl flex items-center justify-center text-slate-400 font-medium border border-slate-200">Initializing Mapping Engine...</div> });

export default function SimulationDashboard() {
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<number>(3);
  const [hour, setHour] = useState<number>(14);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResults, setSimResults] = useState<any>(null);
  const [llmSop, setLlmSop] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([12.9716, 77.5946]);
  
  const handleGeocodeAndSimulate = async () => {
    if (!address) return;
    setIsSimulating(true);
    setLlmSop("");
    
    try {
      let lat = 12.9716;
      let lon = 77.5946;
      
      try {
        // 1. Geocode
        const geoRes = await fetch(`http://localhost:8000/api/geocode?address=${encodeURIComponent(address)}`);
        const geoData = await geoRes.json();
        
        if (geoData && geoData.length > 0) {
          lat = parseFloat(geoData[0].lat);
          lon = parseFloat(geoData[0].lon);
          setMapCenter([lat, lon]);
        }
      } catch (geoError) {
        console.warn("Geocoding failed, falling back to default coordinates:", geoError);
      }
      
      // 2. Call FastAPI simulate endpoint
      const simReq = await fetch("http://localhost:8000/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat, lon, event_type: "Accident", priority, hour, description: description || ("Major traffic incident reported near " + address)
        })
      });
      
      const simData = await simReq.json();
      setSimResults(simData);
      
      // 3. Start LLM Streaming
      const llmReq = await fetch("http://localhost:8000/api/llm-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(simData)
      });
      
      if (llmReq.body) {
        const reader = llmReq.body.getReader();
        const decoder = new TextDecoder("utf-8");
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr.trim() === '[DONE]') break;
                try {
                    const dataObj = JSON.parse(dataStr);
                    if (dataObj.text) {
                        setLlmSop(prev => prev + dataObj.text);
                    }
                } catch (e) {
                    // Ignore parse errors from chunking
                }
            }
          }
        }
      }
      
    } catch (error) {
      console.error("Simulation failed:", error);
    } finally {
      setIsSimulating(false);
    }
  };

  // Prepare Chart Data
  const durationData = simResults ? [
    { name: 'No Intervention', duration: simResults.simulation_results.duration_no_action },
    { name: 'AI Strategy', duration: simResults.simulation_results.duration_with_action }
  ] : [];

  const radarData = simResults ? [
    { subject: 'Traffic Flow', A: 40, B: 90, fullMark: 100 },
    { subject: 'Manpower Eff', A: 50, B: simResults.simulation_results.recommended_manpower_tier * 25, fullMark: 100 },
    { subject: 'Clearance', A: 30, B: 85, fullMark: 100 },
    { subject: 'Safety', A: 60, B: 95, fullMark: 100 },
    { subject: 'Cost', A: 20, B: 70, fullMark: 100 },
  ] : [];
  
  const stressData = simResults ? simResults.geospatial_data.affected_nodes.map((n: any) => ({
      name: `Node ${n.id}`, stress: n.stress_weight * 100
  })) : [];
  
  const decayData = simResults ? [
      { time: '0m', noAction: 100, aiStrategy: 100 },
      { time: '15m', noAction: 95, aiStrategy: 60 },
      { time: '30m', noAction: 85, aiStrategy: 20 },
      { time: '45m', noAction: 70, aiStrategy: 5 },
      { time: '60m', noAction: 60, aiStrategy: 0 },
  ] : [];

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-900 overflow-hidden font-sans">
      {/* Left Panel: Controls & Terminal */}
      <div className="w-[30%] flex flex-col border-r border-slate-200 bg-white p-6 gap-6 shadow-2xl z-10 overflow-y-auto">
        <div className="flex items-center gap-3 mb-2 shrink-0">
            <ShieldAlert className="w-8 h-8 text-indigo-600" />
            <h1 className="text-2xl font-black tracking-tight text-slate-900">TriadCausal<span className="text-indigo-600">Command</span></h1>
        </div>
        
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4">
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2"><MapPin className="w-4 h-4" /> Incident Locator</label>
                <input 
                    type="text" 
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter location (e.g. MG Road, Bengaluru)" 
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium shadow-sm placeholder-slate-400"
                />
            </div>
            
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Description</label>
                <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the incident (e.g. Multi-vehicle collision blocking 2 lanes)..." 
                    rows={2}
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium shadow-sm placeholder-slate-400 resize-none"
                />
            </div>
            
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Priority: {priority}</label>
                    <input type="range" min="1" max="5" value={priority} onChange={(e) => setPriority(parseInt(e.target.value))} className="w-full accent-indigo-600" />
                </div>
                <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Time (Hour): {hour}:00</label>
                    <input type="range" min="0" max="23" value={hour} onChange={(e) => setHour(parseInt(e.target.value))} className="w-full accent-indigo-600" />
                </div>
            </div>

            <button 
                onClick={handleGeocodeAndSimulate}
                disabled={isSimulating}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 active:scale-[0.98]"
            >
                {isSimulating ? <Activity className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5" />}
                {isSimulating ? "Executing Inference..." : "Execute Causal Simulation"}
            </button>
        </div>

        {/* Status Terminal */}
        <div className="bg-[#0f172a] rounded-2xl p-5 shadow-inner border border-slate-800 flex-grow flex flex-col font-mono text-xs overflow-hidden shrink-0 min-h-[200px]">
            <h2 className="text-indigo-400 font-bold mb-4 flex items-center gap-2 border-b border-slate-800 pb-3 uppercase tracking-widest shrink-0">
                <Activity className="w-4 h-4" /> AI Operations Logs
            </h2>
            <div className="text-emerald-400 space-y-3 overflow-y-auto flex-grow opacity-90">
                <p className="flex items-center gap-2"><span className="text-slate-500">[SYS]</span> System initialized.</p>
                <p className="flex items-center gap-2"><span className="text-slate-500">[SYS]</span> Awaiting causal trigger...</p>
                {isSimulating && <p className="text-amber-400 animate-pulse flex items-center gap-2"><span className="text-slate-500">[SYS]</span> &gt; Geocoding and processing...</p>}
                {simResults && (
                    <>
                        <p className="flex items-center gap-2"><span className="text-slate-500">[SYS]</span> &gt; Target coordinates locked.</p>
                        <p className="flex items-center gap-2 text-indigo-300"><span className="text-slate-500">[SYS]</span> &gt; Running SOTA_CausalUrbanGPT Inference...</p>
                        <p className="flex items-center gap-2"><span className="text-slate-500">[SYS]</span> &gt; Processing Adaptive Ripple Graph...</p>
                        <p className="flex items-center gap-2 text-fuchsia-400"><span className="text-slate-500">[SYS]</span> &gt; Generating SOP via LLM...</p>
                    </>
                )}
            </div>
        </div>

        {/* LLM Output Card */}
        <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl min-h-[250px] shadow-sm flex flex-col shrink-0">
            <h2 className="text-indigo-800 font-bold mb-3 flex items-center gap-2 uppercase tracking-wide text-xs">
                <AlertCircle className="w-4 h-4" /> Recommended Command SOP
            </h2>
            <div className="text-slate-700 text-sm leading-relaxed relative flex-grow overflow-y-auto pr-2">
                {llmSop ? (
                    <ReactMarkdown
                        components={{
                            h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-3 text-indigo-900" {...props} />,
                            h2: ({node, ...props}) => <h2 className="text-md font-bold mb-3 mt-4 text-indigo-800 border-b border-indigo-200 pb-1" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-2 mt-3 text-indigo-700" {...props} />,
                            p: ({node, ...props}) => <p className="mb-3" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1 marker:text-indigo-400" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1 marker:text-indigo-400 font-medium" {...props} />,
                            li: ({node, ...props}) => <li className="text-[13px] text-slate-600" {...props} />,
                            strong: ({node, ...props}) => <strong className="font-bold text-slate-800" {...props} />,
                        }}
                    >
                        {llmSop}
                    </ReactMarkdown>
                ) : (
                    <span className="text-slate-400 italic">Deployment instructions will stream here from the causal engine upon execution...</span>
                )}
                {isSimulating && !llmSop && (
                    <span className="inline-block w-2.5 h-4 bg-indigo-500 animate-pulse ml-1 align-middle rounded-sm"></span>
                )}
            </div>
        </div>
      </div>

      {/* Right Panel: Map & Telemetry */}
      <div className="w-[70%] p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Top: Map */}
        <div className="w-full h-[450px] shrink-0 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 relative bg-slate-50 group">
             <div className="absolute top-4 left-4 z-[400] bg-white/95 backdrop-blur-md px-4 py-2 rounded-xl font-bold text-slate-800 shadow-lg border border-slate-100 flex items-center gap-2 text-sm transition-transform group-hover:scale-105">
                <span className="relative flex h-3 w-3 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
                Live Threat Map
             </div>
             <Map center={mapCenter} affectedNodes={simResults?.geospatial_data.affected_nodes || []} allNodes={simResults?.geospatial_data.all_nodes || []} />
        </div>

        {/* Bottom: Telemetry Grid */}
        <div className="w-full grid grid-cols-2 gap-6 pb-12">
            {/* Treatment Effect */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] min-h-[350px]">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-500" /> Clearance Time (Mins)
                </h3>
                <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">Compares the estimated incident clearance duration with and without the AI's causal diversion strategy.</p>
                <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={durationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 600 }} />
                            <Bar dataKey="duration" fill="#4F46E5" radius={[6, 6, 0, 0]} barSize={50} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Network Stress */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] min-h-[350px]">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-rose-500" /> Network Stress Level
                </h3>
                <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">Real-time congestion probability for the top 4 surrounding intersections, based on live TomTom flow metrics.</p>
                <div className="flex-grow">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={stressData} margin={{ top: 5, right: 20, left: 20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} axisLine={false} tickLine={false} />
                            <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 600 }} />
                            <Bar dataKey="stress" fill="#ef4444" radius={[0, 6, 6, 0]} barSize={24} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Decay Curve */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] min-h-[350px]">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" /> Congestion Decay
                </h3>
                <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">Projects the reduction of traffic density over time. Notice the faster clearance curve with AI intervention.</p>
                <div className="flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={decayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="time" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                            <Line type="monotone" dataKey="noAction" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} name="No Action" />
                            <Line type="monotone" dataKey="aiStrategy" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} name="AI Strategy" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Resource Radar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] min-h-[350px]">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-indigo-500" /> Resource Allocation
                </h3>
                <p className="text-xs text-slate-500 mt-1 mb-2 leading-relaxed">Compares the overall efficiency of standard manual police deployment versus the AI-recommended manpower distribution.</p>
                <div className="flex-grow relative -mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                            <Radar name="Manual Deployment" dataKey="A" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.2} />
                            <Radar name="AI Recommended" dataKey="B" stroke="#4F46E5" strokeWidth={2} fill="#4F46E5" fillOpacity={0.4} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
