REGION ?= babel
PY ?= python3
FETCH_ARGS ?=

.PHONY: setup fetch-esdm fetch-all inventory tiles app dev validate clean combine tiles-all

fetch-esdm:       ## Tarik poligon Peta Geologi dari layanan ArcGIS ESDM → data/raw/$(REGION)/esdm/
	cd pipeline && $(PY) 00_fetch_esdm.py $(REGION) $(if $(FAULT_LAYER_URL),--fault-layer-url "$(FAULT_LAYER_URL)",) $(FETCH_ARGS)

fetch-all:         ## Tarik seluruh ID layer nasional; FAULT_LAYER_URL untuk garis sesar
	$(MAKE) fetch-esdm REGION=all FAULT_LAYER_URL="$(FAULT_LAYER_URL)"

setup:            ## Pasang dependensi pipeline & app
	$(PY) -m pip install -r pipeline/requirements.txt
	cd app && npm install

inventory:        ## Ingest + validasi + daftar simbol baru ke crosswalk.csv
	cd pipeline && $(PY) 01_ingest.py $(REGION) && $(PY) 02_validate.py $(REGION) && $(PY) inventory.py $(REGION)

tiles:            ## Jalankan pipeline lengkap → data/out/$(REGION)/$(REGION).pmtiles
	cd pipeline && $(PY) 01_ingest.py $(REGION) && $(PY) 02_validate.py $(REGION) \
	  && $(PY) 03_harmonize.py $(REGION) && $(PY) 04_edgematch.py $(REGION) && $(PY) 05_export.py $(REGION) \
	  && ./06_tile.sh $(REGION)

combine:          ## Gabung units/lines semua region yang sudah dibangun → data/out/all/
	mkdir -p data/out/all
	: > data/out/all/units.geojsonl
	: > data/out/all/lines.geojsonl
	for d in data/out/*/; do \
	  r=$$(basename "$$d"); \
	  if [ "$$r" != "all" ]; then \
	    [ -f "$$d/units.geojsonl" ] && cat "$$d/units.geojsonl" >> data/out/all/units.geojsonl; \
	    [ -f "$$d/lines.geojsonl" ] && cat "$$d/lines.geojsonl" >> data/out/all/lines.geojsonl; \
	  fi; \
	  true; \
	done
	[ -s data/out/all/lines.geojsonl ] || rm -f data/out/all/lines.geojsonl
	@n=$$(wc -l < data/out/all/units.geojsonl 2>/dev/null || echo 0); \
	regions=""; \
	for d in data/out/*/; do r=$$(basename "$$d"); if [ "$$r" != "all" ] && [ -f "$$d/units.geojsonl" ]; then regions="$$regions $$r"; fi; done; \
	echo "Digabung: $$n fitur unit dari region:$$regions"

tiles-all:         ## Bangun dari data/raw/all/esdm tanpa overlap bbox
	$(MAKE) inventory REGION=all
	cd pipeline && $(PY) auto_crosswalk.py all
	$(MAKE) validate
	$(MAKE) tiles REGION=all

validate:         ## Cek konsistensi CSV referensi
	$(PY) pipeline/validate_reference.py

dev:              ## Jalankan app lokal
	cd app && npm run dev

app:              ## Build app produksi ke app/dist
	cd app && npm run build

clean:
	rm -rf data/out/$(REGION)
