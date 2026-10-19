// Classic service-worker helper shared by both apps.
self.vesperFontCache = 'vesper-fonts-v1';
self.readVesperFont = async request => {
  const cache=await caches.open(self.vesperFontCache);
  const hit=await cache.match(request);
  if(hit) return hit;
  const response=await fetch(request);
  if(response.ok) await cache.put(request,response.clone());
  return response;
};
