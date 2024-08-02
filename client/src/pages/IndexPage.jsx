import React, { useEffect, useState } from "react";
import axios from "axios";

import {Link} from "react-router-dom";
import Image from "../Image";

export default function IndexPage() {
  const [guideService, setGuideService] = useState([]);
  useEffect(() => {
    axios.get("/guideService").then((response) => {
      setGuideService(response.data);
    });
  }, []);

  return (
    <div className="mt-8 grid gap-x-6 gap-y-8 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {guideService.length > 0 &&
        guideService.map((service) => (
          <Link to={'/singleGuideService/'+ service._id} key={service._id}>
            <div className="bg-gray-500 mb-2 rounded-2xl flex">
              {service.photos?.[0] && (
                <Image className="rounded-2xl object-cover aspect-square" src={service.photos?.[0]} />
              )}
            </div>
            <h2 className="font-bold">{service.ownerName}</h2>
            <h2 className="font-bold text-sm text-blue200">{service.city}</h2>
            <h3 className="text-sm truncate text-gray-500">{service.title}</h3>
            <div className="mt-2">
              <span className="font-bold">${service.price}</span>
            </div>
          </Link>
        ))}
    </div>
  );
}
