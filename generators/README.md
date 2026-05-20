# Generator Fleet — Management System

Knowledge base for an 11-genset fleet. Each folder contains the operator/field manual(s), a `specs.md` spec sheet, and (where known) a serial roster.

## Inventory

| Folder | Model | Rating | Manual(s) | Units | Serials |
|---|---|---|---|---|---|
| `MEP-803A/` | MEP-803A Tactical Quiet | 10 kW 60 Hz | TM 9-6115-642-10 (op), TM 9-6115-642-24 (field), LO 9-6115-642-12 | 1 | FZ 44975 |
| `PU-798/` | PU-798 Power Unit (trailer-mounted MEP-803A) | 10 kW 60 Hz | TM 9-6115-660-13&P, TM 9-2330-202-14&P (trailer) | 1 | LEADF210826 |
| `MEP-1050-AMMPS-15kW/` | AMMPS MEP-1050 | 15 kW 50/60 Hz | TM 9-6115-751-10 (op), TM 9-6115-751-24&P (field) | 1 | (TBD — read ID plate) |
| `DHS-18kW-T282271T/` | DHS Systems 18 kW Tan (pre-Tier-4) | 18 kW | NOT YET ACQUIRED — proprietary | 2 | GENASY-2534, GENASY-2541 |
| `DHS-18kW-Tier4a/` | DHS Systems 18 kW Tier 4a Tan | 18 kW | NOT YET ACQUIRED — proprietary | 4 | GENASY-3680, GENASY-3692, GENASY-6750, GENASY-6751 |
| `HDT-33kW-TMSS/` | HDT Expeditionary Systems 33 kW TMSS Tan | 33 kW | NOT YET ACQUIRED — proprietary (HDT) | 1 | 8951 |

**Total catalogued: 10 of 11.** 1 genset remaining.

## How to use this folder

1. Each subfolder is the canonical home for that model's manuals and reference material.
2. For each new unit, add its serial to the table above and create an entry in the model folder's spec sheet (serial, install date, location, hour-meter baseline).
3. When asked questions, point Claude at this folder ("read `generators/README.md` and the relevant model folder").

## Manuals status

- **Acquired** (public DoD TMs, Distribution Statement A):
  - MEP-803A: TM 9-6115-642-10 (operator), TM 9-6115-642-24 (field), LO 9-6115-642-12 (lube order)
  - PU-798: TM 9-6115-660-13&P, TM 9-2330-202-14&P (M116A3 trailer)
  - AMMPS MEP-1050: TM 9-6115-751-10 (operator), TM 9-6115-751-24&P (field/sustainment)
- **Outstanding:**
  - DHS Systems 18 kW (both variants) — proprietary. Need OEM documentation from DHS Systems LLC (Orangeburg, NY) or unit-level files.
  - HDT 33 kW TMSS — proprietary. Need OEM documentation from HDT Expeditionary Systems (Tanner, AL).
  - 1 additional genset in fleet — pending photo.
