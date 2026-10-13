"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  CalendarDays,
  RefreshCw,
  X,
} from "lucide-react";


import type {
  PortalContext,
} from "@/lib/portal-access";


type AppointmentsViewProps = {
  context: PortalContext;
};


type Appointment = {
  uid: string;
  title: string;
  start: string;
  end: string | null;
  status: string | null;
  meetingUrl: string | null;
  eventSlug: string;
};


type AppointmentProgramStatus = {
  organizationId: string;
  year: number;

  program: {
    enabled: boolean;
    meetingsPerYear: number;
    regularDurationMinutes: number;
    annualReviewDurationMinutes: number;
  };

  completedCount: number;
  plannedCount: number;
  remainingCount: number;

  nextAppointment:
    | {
        id: string;
        sequenceNumber: number;
        type: string;
        durationMinutes: number;
        startsAt: string | null;
        endsAt: string | null;
        calcomUid: string | null;
      }
    | null;

  nextRequiredMeeting:
    | {
        sequenceNumber: number;
        type:
          | "periodic"
          | "annual_review";
        durationMinutes: number;
      }
    | null;
};


type UpcomingAppointmentResponse = {
  appointment: Appointment | null;

  appointmentStatus?:
    AppointmentProgramStatus |
    null;

  error?: string;
};

type ManageAppointmentResponse = {
  ok?: boolean;
  cancelled?: boolean;
  url?: string;
  error?: string;
};


const dateFormat =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      weekday:
        "long",

      day:
        "numeric",

      month:
        "long",

      year:
        "numeric",
    },
  );


const timeFormat =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      hour:
        "2-digit",

      minute:
        "2-digit",
    },
  );


export default function AppointmentsView({
  context,
}: AppointmentsViewProps) {

  const [
    appointment,
    setAppointment,
  ] =
    useState<Appointment | null>(
      null,
    );


  const [
    appointmentStatus,
    setAppointmentStatus,
  ] =
    useState<
      AppointmentProgramStatus |
      null
    >(
      null,
    );


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    busy,
    setBusy,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  function createBookingUrl() {
    const url =
      new URL(
        "https://cal.com/bestemd/afspraak",
      );

    url.searchParams.set(
      "embed",
      "true",
    );

    url.searchParams.set(
      "name",
      context.profile.display_name,
    );

    url.searchParams.set(
      "email",
      context.profile.email,
    );

    return url.toString();
  }


  const [
    calendarUrl,
    setCalendarUrl,
  ] =
    useState(
      createBookingUrl,
    );


  async function load() {

    setLoading(true);
    setError("");


    try {
      const response =
        await fetch(
          `/api/appointments/upcoming?organizationId=${encodeURIComponent(
            context
              .organizationId,
          )}`,
          {
            cache:
              "no-store",
          },
        );


      const data =
        (await response.json()) as
          UpcomingAppointmentResponse;


      if (!response.ok) {
        throw new Error(
          data.error ??
          "Afspraak kon niet worden geladen.",
        );
      }


      setAppointment(
        data.appointment ??
        null,
      );


      setAppointmentStatus(
        data.appointmentStatus ??
        null,
      );

    } catch (caught) {

      setError(
        caught instanceof Error
          ? caught.message
          : "Afspraak kon niet worden geladen.",
      );

    } finally {
      setLoading(false);
    }
  }


  useEffect(
    () => {
      void load();
    },
    [],
  );


  async function cancelAppointment() {

    if (
      !appointment ||
      busy
    ) {
      return;
    }


    const confirmed =
      window.confirm(
        "Weet je zeker dat je deze afspraak wilt annuleren?",
      );


    if (!confirmed) {
      return;
    }


    setBusy(true);
    setError("");


    try {
      const response =
        await fetch(
          "/api/appointments/manage",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                uid:
                  appointment.uid,

                action:
                  "cancel",

                organizationId:
                  context
                    .organizationId,
              }),
          },
        );


      const data =
        (await response.json()) as
          ManageAppointmentResponse;


      if (
        !response.ok ||
        !data.cancelled
      ) {
        throw new Error(
          data.error ??
          "Annuleren is niet gelukt.",
        );
      }


      setAppointment(
        null,
      );


      setCalendarUrl(
        createBookingUrl(),
      );

    } catch (caught) {

      setError(
        caught instanceof Error
          ? caught.message
          : "Annuleren is niet gelukt.",
      );

    } finally {
      setBusy(false);
    }
  }


  async function rescheduleAppointment() {

    if (
      !appointment ||
      busy
    ) {
      return;
    }


    setBusy(true);
    setError("");


    try {
      const response =
        await fetch(
          "/api/appointments/manage",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                uid:
                  appointment.uid,

                action:
                  "reschedule",

                organizationId:
                  context
                    .organizationId,
              }),
          },
        );


      const data =
        (await response.json()) as
          ManageAppointmentResponse;


      if (
        !response.ok ||
        !data.url
      ) {
        throw new Error(
          data.error ??
          "Wijzigen is niet gelukt.",
        );
      }


      const url =
        new URL(
          data.url,
        );


      url.searchParams.set(
        "embed",
        "true",
      );


      setCalendarUrl(
        url.toString(),
      );


    } catch (caught) {

      setError(
        caught instanceof Error
          ? caught.message
          : "Wijzigen is niet gelukt.",
      );

    } finally {
      setBusy(false);
    }
  }


  return (
    <>
      <div className="heading">
        <div>
          <h1>
            Afspraken
          </h1>
        </div>
      </div>


      {error && (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      )}


      {!loading &&
        appointmentStatus &&
        appointmentStatus
          .program
          .enabled && (
          <section className="appointment-program-card">

            <div className="appointment-program-heading">
              <div>
                <span className="customer-section-label">
                  Jouw gesprekken {
                    appointmentStatus.year
                  }
                </span>

                <h2>
                  {
                    appointmentStatus
                      .completedCount
                  } van {
                    appointmentStatus
                      .program
                      .meetingsPerYear
                  } gesprekken afgerond
                </h2>

                <p>
                  We spreken elkaar verspreid over
                  het jaar. De eerste drie gesprekken
                  duren ongeveer {
                    appointmentStatus
                      .program
                      .regularDurationMinutes
                  } minuten. Het vierde gesprek is
                  het uitgebreide jaaroverzicht van
                  ongeveer {
                    appointmentStatus
                      .program
                      .annualReviewDurationMinutes
                  } minuten.
                </p>
              </div>

              <strong className="appointment-program-score">
                {
                  appointmentStatus
                    .completedCount
                }/{
                  appointmentStatus
                    .program
                    .meetingsPerYear
                }
              </strong>
            </div>


            <div className="appointment-program-stats">

              <div>
                <span>
                  Afgerond
                </span>

                <strong>
                  {
                    appointmentStatus
                      .completedCount
                  }
                </strong>
              </div>

              <div>
                <span>
                  Gepland
                </span>

                <strong>
                  {
                    appointmentStatus
                      .plannedCount
                  }
                </strong>
              </div>

              <div>
                <span>
                  Nog te gaan
                </span>

                <strong>
                  {
                    appointmentStatus
                      .remainingCount
                  }
                </strong>
              </div>

            </div>


            {appointmentStatus
              .nextRequiredMeeting && (
              <div className="appointment-program-next">

                <CalendarDays />

                <div>
                  <span>
                    Volgende gesprek
                  </span>

                  <strong>
                    Gesprek {
                      appointmentStatus
                        .nextRequiredMeeting
                        .sequenceNumber
                    } van {
                      appointmentStatus
                        .program
                        .meetingsPerYear
                    }
                    {" · "}
                    ongeveer {
                      appointmentStatus
                        .nextRequiredMeeting
                        .durationMinutes
                    } minuten
                  </strong>

                  <small>
                    {
                      appointmentStatus
                        .nextRequiredMeeting
                        .type ===
                      "annual_review"
                        ? "Uitgebreid jaaroverzicht: samen kijken we naar het volledige financiële plaatje en de volgende koers."
                        : "Periodiek gesprek: cijfers, vragen, plannen en wat er op dit moment speelt."
                    }
                  </small>
                </div>

              </div>
            )}

          </section>
        )}


      {!loading &&
        appointment && (
          <section className="appointment-current-card">

            <div className="appointment-current-icon">
              <CalendarDays />
            </div>

            <div className="appointment-current-copy">

              <span className="customer-section-label">
                Jouw volgende afspraak
              </span>

              <h2>
                {dateFormat.format(
                  new Date(
                    appointment.start,
                  ),
                )}
              </h2>

              <p>
                {timeFormat.format(
                  new Date(
                    appointment.start,
                  ),
                )}

                {appointment.end
                  ? ` – ${timeFormat.format(
                      new Date(
                        appointment.end,
                      ),
                    )}`
                  : ""}

                {" · "}

                {appointment.title}
              </p>

            </div>

            <div className="appointment-current-actions">

              <button
                type="button"
                onClick={
                  rescheduleAppointment
                }
                disabled={busy}
              >
                <RefreshCw />
                Wijzigen
              </button>

              <button
                type="button"
                className="danger"
                onClick={
                  cancelAppointment
                }
                disabled={busy}
              >
                <X />
                Annuleren
              </button>

            </div>

          </section>
        )}


      <section className="bestemd-calendar-shell">

        <div className="bestemd-calendar-intro">

          <div>
            <span className="bestemd-calendar-label">
              AFSPRAAK PLANNEN
            </span>

            <h2>
              {appointment
                ? "Nieuw moment kiezen"
                : "Kies jouw moment"}
            </h2>

            <p>
              Kies hieronder een beschikbare
              datum en tijd voor jouw gesprek.
            </p>
          </div>

        </div>


        <div className="bestemd-cal-frame-wrap">

          <iframe
            key={calendarUrl}
            src={calendarUrl}
            title="Plan een afspraak met Bestemd"
            className="bestemd-cal-frame"
            allow="camera; microphone; fullscreen"
            loading="eager"
          />

        </div>

      </section>
    </>
  );
}
