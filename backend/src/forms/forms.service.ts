import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import {
  CHECKOUT_STAY_TOGGLES,
  DEFAULT_CHECKIN_FORM,
  DEFAULT_CHECKOUT_FORM,
} from './default-boarding-checkin-checkout-forms';
import { DEFAULT_INCIDENT_REPORT_FORM } from './default-incident-report-form';
import { FormField } from './form-field.types';
import {
  DEFAULT_PRE_CHECKIN_FORM,
  PRE_CHECKIN_DROP_OFF_FIELDS,
  PRE_CHECKIN_EXTRA_BOARDING_QUESTIONS,
  PRE_CHECKIN_LEAD_OPTION_LABELS,
  PRE_CHECKIN_MEDICATIONS_FIELD,
} from './default-pre-checkin-form';
import { Form } from './schemas/form.schema';
import { BoardingWorkflowSettings } from '../settings/schemas/boarding-workflow-settings.schema';

@Injectable()
export class FormsService implements OnModuleInit {
  constructor(
    @InjectModel(Form.name) private readonly formModel: Model<Form>,
    @InjectModel(BoardingWorkflowSettings.name)
    private readonly boardingWorkflowSettingsModel: Model<BoardingWorkflowSettings>,
  ) {}

  // Seeds the "Arrival Check-In", "Departure Check-Out", and "Pre-Check In
  // Form" forms once, on boot -- a first-of-its-kind seed-on-init pattern in
  // this codebase (no existing module does this), so each is a single atomic
  // upsert ($setOnInsert) rather than a find-then-insert pair, which would
  // otherwise race across multiple app instances. Staff can freely edit or
  // delete any of these afterward like any other form -- none is ever
  // re-created once it exists (findOneAndUpdate with upsert only ever
  // inserts when its {name} filter matches nothing).
  //
  // A "Customer Intake" form used to be seeded here too -- removed since it
  // duplicated (and had drifted from) the real public registration wizard
  // (frontend/src/intake/), causing confusion about which one staff should
  // actually use; the real wizard isn't part of this Forms engine at all, so
  // it was never going to show up in this list. Pre-Check In Form is now
  // built directly from that real wizard's fields instead of from this
  // now-removed copy (see default-pre-checkin-form.ts).
  async onModuleInit(): Promise<void> {
    for (const seed of [
      DEFAULT_CHECKIN_FORM,
      DEFAULT_CHECKOUT_FORM,
      DEFAULT_PRE_CHECKIN_FORM,
    ]) {
      await this.formModel
        .findOneAndUpdate({ name: seed.name }, { $setOnInsert: seed }, { upsert: true })
        .exec();
    }
    await this.seedIncidentReportForm();
    await this.addMissingCheckOutDetailsFields();
    await this.upgradePreCheckInForms();
  }

  // Brings any already-seeded "Pre-Check In Form" (or a staff copy of it,
  // matched by its field ids, same approach as the check-out upgrade below)
  // in line with the current default: no keys/alarm-code questions, the
  // terms/declaration shown live from Settings, and the intake wizard's
  // multi-entry medication list in place of the old single-entry fields,
  // "On Lead"/"Off Lead" option text, and the extra boarding and drop-off
  // questions. Each step only fires while its old shape is still there, so this is a
  // no-op on every boot after the first, and a field staff have since
  // reworded or removed is left alone.
  private async upgradePreCheckInForms(): Promise<void> {
    const OLD_SECURITY_IDS = ['cf-sec-keysProvided', 'cf-sec-alarm'];
    const OLD_MEDICATION_IDS = [
      'pf-medicationName',
      'pf-medicationDetails',
      'pf-medicationVetPrescribed',
      'pf-medicationAdministeredByUs',
    ];
    const forms = await this.formModel
      .find({
        $or: [
          { 'fields.id': { $in: [...OLD_SECURITY_IDS, 'cf-ag-termsText', 'cf-ag-declarationText'] } },
          { 'fields.fields.id': { $in: [...OLD_MEDICATION_IDS, 'pf-offLeadMode'] } },
        ],
      })
      .exec();
    for (const form of forms) {
      const before = JSON.stringify(form.fields);
      let fields = (form.fields as unknown as FormField[]).filter((f) => !OLD_SECURITY_IDS.includes(f.id));
      // The lead field's missing optionLabels marks a form that predates the
      // extra boarding/drop-off questions -- once labelled, none of those are
      // re-added, so a question staff later delete stays deleted.
      const addsBoardingQuestions = fields.some(
        (f) =>
          f.type === 'group' &&
          f.fields.some((c) => c.id === 'pf-offLeadMode' && c.type === 'choice' && !c.optionLabels),
      );
      fields = fields.map((f) => {
        if (f.id === 'cf-secHeading' && f.label === 'Security & Agreement') {
          return { ...f, label: 'Additional information & Agreement' };
        }
        if (f.type === 'display' && !f.content) {
          if (f.id === 'cf-ag-termsText') return { ...f, content: 'terms' };
          if (f.id === 'cf-ag-declarationText') return { ...f, content: 'declaration' };
        }
        if (f.type === 'group') {
          let children = f.fields;
          if (!children.some((c) => c.id === PRE_CHECKIN_MEDICATIONS_FIELD.id)) {
            const at = children.findIndex((c) => OLD_MEDICATION_IDS.includes(c.id));
            if (at !== -1) {
              children = children.filter((c) => !OLD_MEDICATION_IDS.includes(c.id));
              children.splice(at, 0, PRE_CHECKIN_MEDICATIONS_FIELD);
            }
          }
          children = children.map((c) =>
            c.id === 'pf-offLeadMode' && c.type === 'choice' && !c.optionLabels
              ? { ...c, optionLabels: PRE_CHECKIN_LEAD_OPTION_LABELS }
              : c,
          );
          const feedingNotesAt = children.findIndex((c) => c.id === 'bq-feedingNotes');
          if (addsBoardingQuestions && feedingNotesAt !== -1 && !children.some((c) => c.id === PRE_CHECKIN_EXTRA_BOARDING_QUESTIONS[0].id)) {
            children = [...children];
            children.splice(feedingNotesAt + 1, 0, ...PRE_CHECKIN_EXTRA_BOARDING_QUESTIONS);
          }
          return children === f.fields ? f : { ...f, fields: children };
        }
        return f;
      });
      // Drop-off goes last, once, on a form that has the boarding questions.
      const hasBoardingQuestions = fields.some(
        (f) => f.type === 'group' && f.fields.some((c) => c.id === 'bq-feedingNotes'),
      );
      if (addsBoardingQuestions && hasBoardingQuestions && !fields.some((f) => f.id === PRE_CHECKIN_DROP_OFF_FIELDS[0].id)) {
        fields = [...fields, ...PRE_CHECKIN_DROP_OFF_FIELDS];
      }
      if (JSON.stringify(fields) !== before) {
        await this.formModel.updateOne({ _id: form._id }, { $set: { fields } }).exec();
      }
    }
  }

  // Seeds the "Incident Report" form the same way as the others above, and
  // -- only on the boot that actually inserts it -- points Settings >
  // Boarding's "Incident report form" picker at it when nothing's chosen
  // yet, so the booking page's Incident Reports card works out of the box.
  // A picker staff later clear (or a form they delete) is never re-filled.
  private async seedIncidentReportForm(): Promise<void> {
    const result = await this.formModel
      .findOneAndUpdate(
        { name: DEFAULT_INCIDENT_REPORT_FORM.name },
        { $setOnInsert: DEFAULT_INCIDENT_REPORT_FORM },
        { upsert: true, new: true, includeResultMetadata: true },
      )
      .exec();
    if (result.lastErrorObject?.updatedExisting || !result.value) return;
    const settings = await this.boardingWorkflowSettingsModel.findOne().exec();
    if (!settings) {
      await this.boardingWorkflowSettingsModel.create({ incidentReportForm: result.value._id });
    } else if (!settings.incidentReportForm) {
      await this.boardingWorkflowSettingsModel
        .updateOne({ _id: settings._id }, { $set: { incidentReportForm: result.value._id } })
        .exec();
    }
  }

  // Any form (the seeded "Departure Check-Out", or a staff copy of it) that
  // still has one of the check-out stay toggles but not its details box
  // gets that box inserted straight after the toggle -- a no-op once every
  // such form has them, so it's safe to run on every boot. Matched by field
  // id, so a toggle staff deleted or a form built from scratch is left alone.
  private async addMissingCheckOutDetailsFields(): Promise<void> {
    const forms = await this.formModel
      .find({ 'fields.id': { $in: CHECKOUT_STAY_TOGGLES.map((t) => t.toggle.id) } })
      .exec();
    for (const form of forms) {
      const fields = [...(form.fields as unknown as FormField[])];
      let changed = false;
      for (const { toggle, details } of CHECKOUT_STAY_TOGGLES) {
        const index = fields.findIndex((f) => f.id === toggle.id);
        if (index === -1 || fields.some((f) => f.id === details.id)) continue;
        fields.splice(index + 1, 0, details);
        changed = true;
      }
      if (changed) {
        await this.formModel.updateOne({ _id: form._id }, { $set: { fields } }).exec();
      }
    }
  }

  create(dto: CreateFormDto): Promise<Form> {
    return new this.formModel(dto).save();
  }

  findAll(): Promise<Form[]> {
    return this.formModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Form> {
    const form = await this.formModel.findById(id).exec();
    if (!form) {
      throw new NotFoundException(`Form ${id} not found`);
    }
    return form;
  }

  async update(id: string, dto: UpdateFormDto): Promise<Form> {
    const form = await this.formModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!form) {
      throw new NotFoundException(`Form ${id} not found`);
    }
    return form;
  }

  async remove(id: string): Promise<void> {
    const result = await this.formModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Form ${id} not found`);
    }
  }
}
