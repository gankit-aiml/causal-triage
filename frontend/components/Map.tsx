"use client";

import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import L from "leaflet";

// Fix Leaflet's default icon path issues in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

interface MapProps {
  center: [number, number];
  affectedNodes: Array<{ id: number; lat: number; lon: number; stress_weight: number }>;
  allNodes?: Array<{ id: number; lat: number; lon: number }>;
}

export default function Map({ center, affectedNodes, allNodes = [] }: MapProps) {
  const [routePaths, setRoutePaths] = useState<[number, number][][]>([]);
  const [animatedRadius, setAnimatedRadius] = useState<{ [key: number]: number }>({});

  useEffect(() => {
    if (affectedNodes.length > 0) {
      let start = 0;
      const interval = setInterval(() => {
        start += 0.05;
        if (start >= 1) {
            clearInterval(interval);
            start = 1;
        }
        const newRadii: { [key: number]: number } = {};
        affectedNodes.forEach(n => {
            // Start at max stress (1.0), shrink down to target calculated stress
            const initialStress = 1.0;
            const targetStress = n.stress_weight;
            const currentStress = initialStress - (initialStress - targetStress) * start;
            newRadii[n.id] = currentStress * 30; // base scale 30
        });
        setAnimatedRadius(newRadii);
      }, 50); // 1-second decay animation
      return () => clearInterval(interval);
    } else {
      setAnimatedRadius({});
    }
  }, [affectedNodes]);

  useEffect(() => {
    if (affectedNodes.length === 0) {
        setRoutePaths([]);
        return;
    }

    const fetchRoutes = async () => {
        try {
            // Fetch radial routes from origin to each affected node (Star Topology)
            const promises = affectedNodes.map(node => {
                const coordString = `${center[1]},${center[0]};${node.lon},${node.lat}`;
                return fetch(`http://localhost:8000/api/route`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ coordString })
                }).then(r => r.json());
            });
            
            const results = await Promise.all(promises);
            const newPaths: [number, number][][] = [];
            
            results.forEach((data, idx) => {
                if (data.routes && data.routes.length > 0) {
                    const geojsonCoords = data.routes[0].geometry.coordinates;
                    const leafletCoords = geojsonCoords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
                    newPaths.push(leafletCoords);
                } else {
                    // Fallback to straight line for this segment
                    newPaths.push([center, [affectedNodes[idx].lat, affectedNodes[idx].lon]]);
                }
            });
            setRoutePaths(newPaths);
        } catch (e) {
            console.error("Routing fetch failed, falling back to straight lines", e);
            const fallbackPaths = affectedNodes.map(n => [center, [n.lat, n.lon]] as [number, number][]);
            setRoutePaths(fallbackPaths);
        }
    };
    fetchRoutes();
  }, [center, affectedNodes]);

  // Helper to check if a node is physically on any of the congested routes
  const isNodeOnRoute = (lat: number, lon: number) => {
      for (const path of routePaths) {
          for (const [pLat, pLon] of path) {
              // 0.001 degrees is roughly ~100 meters
              const dist = Math.sqrt(Math.pow(lat - pLat, 2) + Math.pow(lon - pLon, 2));
              if (dist < 0.001) return true;
          }
      }
      return false;
  };

  return (
    <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%", borderRadius: "0.75rem", zIndex: 0 }}>
      <ChangeView center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <Marker position={center}>
        <Popup>Incident Origin</Popup>
      </Marker>

      {allNodes.map((node) => {
        if (affectedNodes.some(n => n.id === node.id)) return null;
        
        const onRoute = isNodeOnRoute(node.lat, node.lon);
        const color = onRoute ? "#f97316" : "#22c55e"; // Orange if on route, else Green
        const radius = onRoute ? 6 : 4;
        
        return (
          <CircleMarker
            key={`all-${node.id}`}
            center={[node.lat, node.lon]}
            radius={radius}
            pathOptions={{ color: color, fillColor: color, fillOpacity: onRoute ? 0.8 : 0.4, weight: 1 }}
          >
            <Popup>{onRoute ? "Secondary Route Congestion" : "Unaffected Node"}: ID {node.id}</Popup>
          </CircleMarker>
        );
      })}
      
      {affectedNodes.map((node) => {
        const radius = animatedRadius[node.id] || (node.stress_weight * 30);
        return (
          <CircleMarker
            key={node.id}
            center={[node.lat, node.lon]}
            radius={radius}
            pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.6, weight: 2 }}
          >
            <Popup>Primary Bottleneck: {(node.stress_weight * 100).toFixed(1)}%</Popup>
          </CircleMarker>
        );
      })}
      
      {routePaths.map((path, idx) => (
        <Polyline key={`route-${idx}`} positions={path} pathOptions={{ color: "#ef4444", weight: 6, className: "route-impact opacity-80" }} />
      ))}
    </MapContainer>
  );
}
