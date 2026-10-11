import {
  requireAal2,
} from "@/lib/portal-access";

import {
  requirePersonalIdentity,
} from "@/lib/personal-access";

import {
  portalApi,
} from "@/lib/portal-api";


const MAX_FILE_SIZE =
  10 * 1024 * 1024;


const ALLOWED_TYPES =
  new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);


function safeFilename(
  input: string,
) {
  const cleaned =
    input
      .normalize("NFKC")
      .replace(
        /[^a-zA-Z0-9._ -]/g,
        "_",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  return (
    cleaned.slice(
      0,
      180,
    ) ||
    "document"
  );
}


export async function POST(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePersonalIdentity(
          client,
        );

      requireAal2(
        identity,
      );


      const form =
        await request.formData();

      const candidate =
        form.get("file");


      if (
        !(candidate instanceof File)
      ) {
        return Response.json(
          {
            error:
              "Kies eerst een document.",
          },
          {
            status: 400,
          },
        );
      }


      if (
        candidate.size <= 0 ||
        candidate.size >
          MAX_FILE_SIZE
      ) {
        return Response.json(
          {
            error:
              "Het document mag maximaal 10 MB zijn.",
          },
          {
            status: 400,
          },
        );
      }


      if (
        !ALLOWED_TYPES.has(
          candidate.type,
        )
      ) {
        return Response.json(
          {
            error:
              "Alleen PDF, JPG, PNG en WEBP zijn toegestaan.",
          },
          {
            status: 400,
          },
        );
      }


      const filename =
        safeFilename(
          candidate.name,
        );

      const objectId =
        crypto.randomUUID();

      const storagePath =
        [
          identity.profile.id,
          "inbox",
          `${objectId}-${filename}`,
        ].join("/");


      const bytes =
        new Uint8Array(
          await candidate.arrayBuffer(),
        );


      const {
        error: uploadError,
      } =
        await client.storage
          .from(
            "personal-documents",
          )
          .upload(
            storagePath,
            bytes,
            {
              contentType:
                candidate.type,
              upsert: false,
            },
          );


      if (uploadError) {
        console.error(
          "personal document upload failed",
          {
            message:
              uploadError.message,
          },
        );

        return Response.json(
          {
            error:
              "Het document kon niet worden geüpload.",
          },
          {
            status: 503,
          },
        );
      }


      const now =
        new Date();

      const {
        data: document,
        error: insertError,
      } =
        await client
          .from(
            "personal_documents",
          )
          .insert({
            user_id:
              identity.profile.id,

            filename,

            mime_type:
              candidate.type,

            size_bytes:
              candidate.size,

            storage_path:
              storagePath,

            source:
              "customer",

            status:
              "new",

            document_type:
              "other",

            book_year:
              now.getFullYear(),

            book_month:
              now.getMonth() + 1,

            archive_folder_name:
              null,

            visible_to_customer:
              true,

            customer_action_required:
              false,

            acknowledgement_required:
              false,
          })
          .select(
            "id,filename,status,created_at",
          )
          .single();


      if (insertError) {
        console.error(
          "personal document record insert failed",
          {
            code:
              insertError.code,

            message:
              insertError.message,
          },
        );

        await client.storage
          .from(
            "personal-documents",
          )
          .remove([
            storagePath,
          ]);

        return Response.json(
          {
            error:
              "Het document kon niet worden geregistreerd.",
          },
          {
            status: 503,
          },
        );
      }


      return Response.json(
        {
          ok: true,
          document,
        },
        {
          status: 201,
        },
      );
    },
  );
}
