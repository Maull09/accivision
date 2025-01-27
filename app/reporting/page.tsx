"use client";

import { useState } from "react";
import FilterControls from "./filter";
import ReportForm from "./reportform";
import { useAuth, useUser } from "@clerk/nextjs";
import { fetchProvinces, fetchRegenciesByProvince,
  fetchDistrictsByRegency
 } from "@/lib/utils";
import { insertReport, insertNotification, updateOrInsertHeatmap } from "@/lib/api";
import { v4 as uuidv4 } from "uuid";

export default function ReportingPage() {
  const { userId } = useAuth();
  const { user } = useUser();

  const [filters, setFilters] = useState({
    province: "",
    city: "",
    district: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertType, setAlertType] = useState<"success" | "error" | null>(null);

  const handleFilterChange = (updatedFilters: typeof filters) => {
    setFilters(updatedFilters);
  };

  const handleSubmit = async (formData: FormData) => {
    setSubmitting(true);
    setAlertMessage(null);

    if (!userId || !user) {
      setAlertMessage("User not authenticated");
      setAlertType("error");
      setSubmitting(false);
      return;
    }

    try {
      // Prepare data
      const provinces = fetchProvinces();
      const cities = fetchRegenciesByProvince(filters.province);
      const districts = fetchDistrictsByRegency(filters.city);
      
      // Fetch the name of the selected province, city, and district
      const selectedProvince = provinces.find(
        (province) => province.name === formData.get("province")
      )?.name;

      const selectedCity = cities.find(
        (city) => city.name === formData.get("city")
      )?.name;

      const selectedDistrict = districts.find(
        (district) => district.name === formData.get("district")
      )?.name;

      const description = formData.get("description") as string;
      const userId = formData.get("userId") as string;

      if (!selectedProvince || !selectedCity || !selectedDistrict || !userId) {
        throw new Error("Incomplete form submission");
      }

      // Call backend detection and mailing
      let detectionResult;
      try {
        const response = await fetch('https://accivision-backend-production.up.railway.app/process_detection', {
          method: "POST",
          body: formData,
        });
      
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
      
        detectionResult = await response.json();
        console.log("Detection result:", detectionResult);
      } catch (error) {
        if (error instanceof Error) {
          console.error("Error during backend call:", error.message);
        } else {
          console.error("Error during backend call:", error);
        }
        throw error;
      }

      // Determine status based on detection
      const detectionStatus = detectionResult.detectionStatus || "not_detected";
      console.log("Detection status:", detectionStatus);

      const imagePath = detectionResult.imageUrl;
      console.log("Image path:", imagePath);
      
      // Insert report
      const reportId = await insertReport({
        userId,
        province: selectedProvince,
        city: selectedCity,
        district: selectedDistrict,
        description,
        status: detectionStatus,
        createdAt: new Date(),
        image: imagePath,
      });

      // Insert notification
      await insertNotification({
        userId,
        reportId,
        message: `Laporan baru untuk kecamatan ${selectedDistrict}, ${selectedCity}, ${selectedProvince} dengan status ${detectionStatus}`,
        isRead: false,
        createdAt: new Date(),
      });

      const getLatitude = (district: string): number => {
        console.log("District:", district);
        const districtData = districts.find((d) => d.name === district);
        console.log("District Data:", districtData);
        return districtData?.latitude || 0.0;
      };
      
      const getLongitude = (district: string): number => {
        console.log("District:", district);
        const districtData = districts.find((d) => d.name === district);
        console.log("District Data:", districtData);
        return districtData?.longitude || 0.0;
      };
      
      // Update or insert heatmap
      if (detectionStatus === "detected") {
        await updateOrInsertHeatmap({ 
          reportId: reportId.toString(),
          province: selectedProvince, 
          city: selectedCity, 
          district: selectedDistrict,
          id: uuidv4().toString(),
          intensity: 1,
          latitude: getLatitude(selectedDistrict),
          longitude: getLongitude(selectedDistrict),
        });
        console.log("Updated heatmap for", selectedDistrict, selectedCity, selectedProvince);
      }

      setAlertMessage("Laporan berhasil dikirim!");
      setAlertType("success");
    } catch (error) {
      console.error(error);
      setAlertMessage("Terjadi kesalahan saat mengirim laporan.");
      setAlertType("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="bg-white shadow-md rounded-lg p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-600">
          Laporan Kecelakaan
        </h1>
        <FilterControls selectedFilters={filters} onFilterChange={handleFilterChange} />
        <ReportForm filters={filters} onSubmit={handleSubmit} submitting={submitting} />
        {alertMessage && (
          <p
            className={`mt-4 text-center font-medium ${
              alertType === "success" ? "text-green-600" : "text-red-600"
            }`}
          >
            {alertMessage}
          </p>
        )}
      </div>
    </div>
  );
}

