REGION ?= babel
PY ?= python3

.PHONY: setup inventory tiles app dev validate clean

setup:            ## Pasang dependensi pipeline & app
	$(PY) -m pip install -r pipeline/requirements.txt
	cd app && npm install

inventory:        ## Ingest + validasi + daftar simbol baru ke crosswalk.csv
	cd pipeline && $(PY) 01_ingest.py $(REGION) && $(PY) 02_validate.py $(REGION) && $(PY) inventory.py $(REGION)

tiles:            ## Jalankan pipeline lengkap → data/out/$(REGION)/$(REGION).pmtiles
	cd pipeline && $(PY) 01_ingest.py $(REGION) && $(PY) 02_validate.py $(REGION) \
	  && $(PY) 03_harmonize.py $(REGION) && $(PY) 04_edgematch.py $(REGION) && $(PY) 05_export.py $(REGION) \
	  && ./06_tile.sh $(REGION)

validate:         ## Cek konsistensi CSV referensi
	$(PY) pipeline/validate_reference.py

dev:              ## Jalankan app lokal
	cd app && npm run dev

app:              ## Build app produksi ke app/dist
	cd app && npm run build

clean:
	rm -rf data/out/$(REGION)
