"""Offline geometry preparation from an OSM XML extract; no routing service in app.

Run with an OSM XML path. Prints JSON for static/data/route-paths.js.
Only public walkable ways are used; every output edge is an original OSM edge.
"""
import sys, json, subprocess, heapq, math
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
nodes = {n.attrib['id']: [float(n.attrib['lat']), float(n.attrib['lon'])] for n in root.findall('node')}
tags = lambda element: {t.attrib['k']: t.attrib['v'] for t in element.findall('tag')}
distance = lambda a, b: math.hypot((a[0]-b[0])*111195, (a[1]-b[1])*98650)
graph = {}
for way in root.findall('way'):
    t = tags(way)
    if t.get('highway') not in {'residential','living_street','tertiary','secondary','unclassified','service','footway','path','pedestrian','steps','cycleway'}: continue
    if t.get('access') in {'private','no'} or t.get('foot') in {'private','no'} or t.get('indoor') == 'yes' or t.get('area') == 'yes': continue
    ids = [n.attrib['ref'] for n in way.findall('nd')]
    for a,b in zip(ids,ids[1:]):
        if a not in nodes or b not in nodes: continue
        length = distance(nodes[a],nodes[b])
        graph.setdefault(a,{})[b] = length
        graph.setdefault(b,{})[a] = length

def path(start, end, blocked=frozenset()):
    todo=[(0,start)]; costs={start:0}; previous={}
    while todo:
        cost,node=heapq.heappop(todo)
        if cost != costs[node]: continue
        if node == end:
            out=[end]
            while out[-1] != start: out.append(previous[out[-1]])
            return out[::-1]
        for nxt,weight in graph.get(node,{}).items():
            if frozenset((node,nxt)) in blocked: continue
            new=cost+weight
            if new < costs.get(nxt,float('inf')):
                costs[nxt]=new; previous[nxt]=node; heapq.heappush(todo,(new,nxt))
    return None

coordinate_ids = {tuple(nodes[n]): n for n in graph}
def nearest(point): return min(graph,key=lambda n: distance(point,nodes[n]))
def length(ids): return sum(distance(nodes[a],nodes[b]) for a,b in zip(ids,ids[1:]))

if '--verify' in sys.argv:
    js = "const fs=require('fs'),vm=require('vm'),c={};vm.createContext(c);vm.runInContext(['static/data/places.js','static/data/route-paths.js','static/data/routes.js'].map(p=>fs.readFileSync(p,'utf8')).join('\\n')+';this.result={routes:ROUTE_VARIANTS,places:PLACES}',c);console.log(JSON.stringify(c.result))"
    current=json.loads(subprocess.check_output(['node','-e',js],text=True,encoding='utf8'))
    for id,route in current['routes'].items():
        ids=[coordinate_ids[tuple(p)] for p in route['coordinates']]
        for a,b in zip(ids,ids[1:]):
            assert b in graph[a], f'{id}: not a public walkable OSM edge {a} {b}'
        for place_id,index in zip(route['placeIds'],route['stopIndexes']):
            place=current['places'][place_id]
            assert distance(route['coordinates'][index],[place['latitude'],place['longitude']])<1, f'{id}: misplaced stop {place_id}'
    print(f"PASS: all {len(current['routes'])} primary/alternative paths follow walkable OSM edges; all stops match their map coordinates")
    sys.exit()

# Read primary data before attaching offline detours.
js = "const fs=require('fs'),vm=require('vm'),c={};vm.createContext(c);vm.runInContext(fs.readFileSync('static/data/places.js','utf8')+fs.readFileSync('static/data/routes.js','utf8').split('// Offline-curated detours')[0]+';this.result={routes:ROUTE_VARIANTS,places:PLACES}',c);console.log(JSON.stringify(c.result))"
baseline=json.loads(subprocess.check_output(['node','-e',js],text=True,encoding='utf8'))

if '--inspect' in sys.argv:
    for element in root:
        t=tags(element)
        if 'west village' in t.get('name','').lower():
            print(element.tag, element.attrib, t)
    sys.exit()

place_nodes={id:nearest([p['latitude'],p['longitude']]) for id,p in baseline['places'].items()}
# Outdoor Boundary Street entry at 97 Boundary Street, beside The Common.
place_nodes['west_village'] = nearest([-27.47815,153.01204])

def itinerary(ids):
    route=[place_nodes[ids[0]]]; stops=[0]
    for id in ids[1:]:
        leg=path(route[-1],place_nodes[id])
        if not leg: raise ValueError('Disconnected stop '+id)
        route.extend(leg[1:]); stops.append(len(route)-1)
    return route,stops

def detour(ids,stops):
    # Only detour inside a leg: retain every stop and the travelled prefix.
    best=None
    for i in range(1,len(ids)-2):
        j=i+1
        blocked=frozenset((ids[i],ids[j]))
        if any(st == i for st in stops): pass
        alt=path(ids[i],ids[j],{blocked})
        if not alt: continue
        separation=max(min(distance(nodes[n],nodes[r]) for r in ids) for n in alt)
        extra=length(alt)-distance(nodes[ids[i]],nodes[ids[j]])
        if separation < 55 or extra < 150 or extra > 2500: continue
        # Avoid travelling through another itinerary stop before its turn.
        if any(ids[s] in alt[1:-1] for s in stops): continue
        score=extra + abs(i/len(ids)-.3)*150
        if best is None or score<best[0]: best=(score,i,j,alt,separation)
    if best is None: return None
    _,i,j,alt,separation=best
    alternative=ids[:i+1]; positions={s:s for s in stops if s<=i}
    # Out-and-back walks may traverse the busy edge again on the return leg.
    # Replace every future occurrence, including the reverse direction.
    for k in range(i,len(ids)-1):
        if ids[k:k+2] == [ids[i],ids[j]]: section=alt
        elif ids[k:k+2] == [ids[j],ids[i]]: section=alt[::-1]
        else: section=ids[k:k+2]
        alternative.extend(section[1:]); positions[k+1]=len(alternative)-1
    return dict(coordinates=[nodes[n] for n in alternative],stopIndexes=[positions[s] for s in stops],
        triggerIndex=i,busySegment=[i,j],separationMeters=round(separation))

output={}
routes=baseline['routes']
# Dedicated retail and matching alternatives preserve Add/Change stop ordering.
for cafe in ['cafe_quiet','cafe_social']:
    for suffix in [[],['riverside_path'],['orleigh_park'],['riverside_path','orleigh_park']]:
        for shop in ['west_village','boundary_precinct']:
            ids=[cafe,shop]+suffix
            id='retail_'+ '_'.join(ids)
            route,stops=itinerary(ids)
            routes[id]={'id':id,'placeIds':ids,'coordinates':[nodes[n] for n in route],'stopIndexes':stops,'newRoute':True}
for ids in [['west_village','riverside_path'],['west_village','orleigh_park'],['west_village','riverside_path','orleigh_park'],['davies_market','west_village'],['west_village','boundary_precinct']]:
    route,stops=itinerary(ids); id='retail_'+'_'.join(ids)
    routes[id]={'id':id,'placeIds':ids,'coordinates':[nodes[n] for n in route],'stopIndexes':stops,'newRoute':True}
# A short outdoor retail stroll ends back at its entry (no indoor access claim).
wv=place_nodes['west_village']; target=nearest([-27.47760,153.01212]); outward=path(wv,target)
routes['west_village_short']={'id':'west_village_short','placeIds':['west_village'],'coordinates':[nodes[n] for n in outward+outward[-2::-1]],'stopIndexes':[2*len(outward)-2],'newRoute':True}

for id,route in routes.items():
    if route.get('hidden') or id=='default_quiet': continue
    original=route['coordinates']; ids=[coordinate_ids.get(tuple(p)) for p in original]
    if any(n is None for n in ids):
        missing=[p for p,n in zip(original,ids) if n is None]
        raise ValueError(f'{id} missing OSM points: {missing[:3]}')
    stops=route['stopIndexes']; alternative=detour(ids,stops)
    if not alternative:
        start=place_nodes[route['placeIds'][0]]
        targets=sorted((n for n in graph if 220 < distance(nodes[start],nodes[n]) < 450), key=lambda n:abs(distance(nodes[start],nodes[n])-300))
        for target in targets[:100]:
            outward=path(start,target)
            if not outward or length(outward)>650: continue
            if len(route['placeIds']) == 1:
                trial=outward+outward[-2::-1]; trial_stops=[len(trial)-1]
            else:
                trial=outward[::-1]+ids[1:]; trial_stops=[s+len(outward)-1 for s in stops]
            alternative=detour(trial,trial_stops)
            if alternative:
                ids=trial; stops=trial_stops; original=[nodes[n] for n in ids]; route['newRoute']=True; break
    if not alternative: raise ValueError('No geographically distinct detour: '+id)
    output[id]={'alternative':alternative}
    if route.get('newRoute'): output[id].update(coordinates=original,stopIndexes=stops,placeIds=route['placeIds'])
# Store shared coordinates once to keep the committed route data compact.
points=[]; point_indexes={}
def encode(coordinates):
    result=[]
    for point in coordinates:
        key=tuple(point)
        if key not in point_indexes: point_indexes[key]=len(points); points.append(point)
        result.append(point_indexes[key])
    return result
for route in output.values():
    if 'coordinates' in route: route['path']=encode(route.pop('coordinates'))
    route['alternative']['path']=encode(route['alternative'].pop('coordinates'))
print(json.dumps({'westVillagePosition':nodes[wv],'points':points,'routes':output},separators=(',',':')))
