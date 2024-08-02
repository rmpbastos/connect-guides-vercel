import Image from "./Image";

export default function GuideServiceImg({service, index=0, className=null}){
    if(!service.photos?.length){
        return '';
    }
    if(!className){
        className = 'object-cover';

    }
    return(
        <Image className={className} src={service.photos[index]}
              alt={service.title} />
    );
}